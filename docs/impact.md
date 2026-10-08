# Аналіз впливу — BILL-482

> Task B. Заповнено **до** зміни коду.

## 1. Що саме змінюється

Дати, які бачать **клієнти** (рахунок і листи-нагадування), мають виводитись як
`дд.мм.рррр` (`09.03.2026`), а не як `MM/DD/YYYY` (`03/09/2026`). Зараз їх
формує спільна `formatDate` у `app/lib/format.js:29-34`. Її ж використовує
нічний CSV для бухгалтерії, де формат мусить лишитись `MM/DD/YYYY`.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | HTML рахунку: `app/lib/invoices/render.js:38-39` («Дата», «Сплатити до»). Віддається `GET /invoices/:number` (`app/lib/invoices/routes.js:27-36`, без `x-staff-id`) і `app/bin/render-invoice.js` | Прямий виклик `format.formatDate` | **Людина** — клієнт у браузері, роздрук | **Змінитись** на `дд.мм.рррр` — це суть тікета |
| 2 | Листи-нагадування: `app/lib/notifications/reminders.js:40,46` («мав бути сплачений до …», «слід сплатити до …»). Пише `app/bin/send-reminders.js` (cron 09:00) у `out/mail/`, звідти бере SMTP-relay | Прямий виклик `format.formatDate` | **Людина** — клієнт у листі | **Змінитись** на `дд.мм.рррр` |
| 3 | CSV для «Облік-Плюс»: колонки `DocDate`, `PayUntil`. Код у `app/lib/export/accounting.js:29-35`, пише `app/bin/nightly-export.js` (cron 02:30) у `out/export/oblik-YYYY-MM-DD.csv`, о 06:00 сервер бухгалтерії забирає сам | **Непрямо.** Форматер обирається за іменем у рантаймі: `format['format' + col.type]`, а `config/export-columns.json:3-4` задає `"type": "Date"`. Ім'я `formatDate` у файлі не трапляється | **Інша система** — імпорт «Облік-Плюс» з американською локаллю | **Лишитись як є, байт у байт.** Рядок з іншою датою «Облік-Плюс» мовчки пропускає, без помилки (`app/docs/integrations/oblik-plus.md:23,27-35`; так у лютому 2021 загубили 40 рахунків). Типи колонок міняти не можна (`oblik-plus.md:16`), а змінити формат для бухгалтерії можна лише після попередження за тиждень — тікет цього не просить |

Перевірено і **не залежить** від `formatDate`:

| Що | Чому не зачепить |
|---|---|
| Звіти `app/lib/reports/*`, `/api/reports/*`, `app/bin/monthly-report.js` | Власні хелпери `app/lib/reports/dates.js` (ISO і назви місяців) і `fmtAmount` у `table.js`. `lib/format.js` не імпортують |
| `app/lib/legacy/templates.js` (helper `date` → `dmy`) | Мертвий (каталогу `templates/` немає, імпортує лише мертвий `pdf-client.js`), має власну реалізацію, вже дає `дд.мм.рррр` |
| JSON `/api/*` (рахунки, клієнти, оплати…) | Віддають сирі поля `YYYY-MM-DD` з `data/*.json`, без форматування |
| Імена файлів `out/mail/<дата>-…txt`, `oblik-<дата>.csv` | Беруться з `toISOString().slice(0, 10)` / аргументу CLI |
| Виписка банку `app/lib/payments/statement.js` | Вхід, парсить `DDMMYYYY` → ISO; `formatDate` не використовує |
| `formatMoney`/`formatDecimal`/`formatText` | Тікет їх не стосується; у CSV суми йдуть через `formatDecimal` і лишаються як є |

## 3. Як ви їх шукали

1. `grep -rn "formatDate" app/lib app/bin` → лише споживачі 1 і 2
   (`render.js:38,39`, `reminders.js:40,46`). **Цей пошук CSV не знаходить.**
2. `grep -rn "require('../format')" app/lib app/bin` → трьох імпортерів:
   `invoices/render.js`, `notifications/reminders.js` **і**
   `export/accounting.js`. Третій модуль у пошуку за ім'ям не з'явився, тому
   відкрили його. Там `format['format' + col.type]`, а в
   `config/export-columns.json` — `"type": "Date"` для двох колонок.
3. Перевірка рантаймом: `node -e` з `buildAccountingFile` по `data/` дає
   `INV-2026-00001;03/01/2026;03/15/2026;…` — у CSV дати `MM/DD/YYYY` з
   `formatDate`.
4. Контрольний пошук інших форматерів дат (`getUTC*`, `getMonth`,
   `toLocale*`, `toISOString`, `'/'`) → `lib/reports/dates.js`,
   `lib/legacy/templates.js` (`dmy`), `lib/orders/index.js`,
   `lib/catalog/price-import.js`, `lib/audit/*`. Усі вони роблять ISO або мертві,
   і жоден не залежить від `lib/format.js` (таблиця «не залежить» вище).
5. Мутаційна перевірка характеризаційних тестів: `formatDate` підмінили в
   пам'яті (`node --require`) на `дд.мм.рррр`. Усі три golden-тести почервоніли,
   тобто кожен споживач справді йде через `formatDate`.

## 4. Характеризаційні тести

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `app/test/characterization.test.js` → «invoice HTML for every invoice» | `renderInvoiceHtml` для всіх 36 рахунків з `data/` vs `app/test/golden/invoices.html` | так |
| `app/test/characterization.test.js` → «reminder mails on …» | `buildReminders` на 2026-03-12, 2026-03-20, 2026-04-01 (51 лист: upcoming і overdue) vs `app/test/golden/reminders.txt` | так |
| `app/test/characterization.test.js` → «Oblik Plus accounting CSV» | `buildAccountingFile` по `data/` байт у байт (`;`, CRLF, заголовок, дати, суми) vs `app/test/golden/oblik.csv`. `golden/.gitattributes` = `* -text`, щоб git не чіпав CRLF | так |
| `app/test/format.test.js` → «formatDate: current output is MM/DD/YYYY» | Прямий контракт `formatDate`: рядок, ISO з часом, `Date`, порожнє й некоректне значення | так |

`cd app && npm test` → `tests 110, pass 110, fail 0` (106 засіяних + 4 нові).
Тести лише читають `data/*.json`. Еталони перегенеровуються командою
`UPDATE_GOLDEN=1 node --test test/characterization.test.js`.

Коміт із тестами (до зміни): `9f2b29e` — «Task B: characterization tests and impact analysis»

Очікування на Task C:
- `invoices.html` і `reminders.txt` **мають** почервоніти (очікувано).
- Також очікувано почервоніє засіяний `app/test/invoices.test.js:41-42`.
- `oblik.csv` **мусить лишитись зеленим**: червоний означає регресію для «Облік-Плюс».

## 5. Після зміни (Task C)

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| `characterization.test.js` → invoice HTML | так | **Очікувано.** HTML рахунку читає клієнт; тікет просить `дд.мм.рррр` | Перегенеровано лише цей еталон (`--test-name-pattern="customer-facing"`). Перевірка: після заміни `дд.мм.рррр` → `MM/DD/YYYY` новий `invoices.html` байт у байт збігається з версією з `9f2b29e`, отже змінились тільки дати |
| `characterization.test.js` → reminder mails | так | **Очікувано.** Листи читає клієнт; тікет прямо називає «сплатити до 03/12/2026» | Так само: перегенеровано, перевірено зворотною заміною, що змінились лише дати (51 лист) |
| `characterization.test.js` → Oblik Plus CSV | **ні** | — (вихід для іншої системи, не мав змінитись) | Нічого. `git diff test/golden/oblik.csv` порожній. Реальний `buildAccountingFile` по `data/` = еталон із `9f2b29e` (`cmp`) |
| `format.test.js` → formatDate MM/DD/YYYY | **ні** | — | Нічого: `formatDate` не змінювали, він і далі живить CSV |
| засіяний `invoices.test.js` → «rendered invoice shows … dates» (`:41-42`) | так | **Очікувано.** Він фіксував клієнтський HTML у старому форматі `03/09/2026` | Очікування змінено на `09.03.2026` / `23.03.2026`, решту тесту не чіпали |

**Рішення.** `formatDate` не змінювали. Додали `formatDateUk` (`дд.мм.рррр`) у
`app/lib/format.js` і перевели на нього лише двох клієнтських споживачів:
`invoices/render.js:38-39` і `notifications/reminders.js:40,46`. CSV
(`export/accounting.js`, тип колонки `Date`) і далі отримує `MM/DD/YYYY` — для
«Облік-Плюс» нічого не змінилося. Це той самий поділ, що вже є для грошей
(`formatMoney` для людей, `formatDecimal` для машин). JSDoc `formatDate`, який
неправильно казав «ISO format», виправлено. Тепер там сказано, що це машинний
формат для CSV і що його не можна міняти.

Новий тест `format.test.js` → `formatDateUk` фіксує новий контракт. Разом:
`npm test` → `tests 111, pass 111, fail 0`. Наскрізна перевірка:
`bin/render-invoice.js INV-2026-00007` і `GET /invoices/INV-2026-00007` дають
`Дата: 07.03.2026 · Сплатити до: 21.03.2026`.
