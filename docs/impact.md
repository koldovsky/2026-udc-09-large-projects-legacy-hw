# Аналіз впливу — BILL-482



## 1. Що саме змінюється

Спільна функція `formatDate` у [app/lib/format.js:29-34](../app/lib/format.js#L29-L34)
зараз перетворює `2026-03-09` на `03/09/2026` (`MM/DD/YYYY`). Тікет просить,
щоб клієнти бачили в рахунках і листах-нагадуваннях `09.03.2026`
(`дд.мм.рррр`). Але `formatDate` використовує ще й нічний експорт для
«Облік-Плюс», якому потрібен саме `MM/DD/YYYY`. Тому одна зміна формату у
`formatDate` вплине на трьох споживачів, а потрібна вона лише двом.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | HTML-рахунок: `renderInvoiceHtml` у [app/lib/invoices/render.js:38-39](../app/lib/invoices/render.js#L38-L39) («Дата:» і «Сплатити до:») | **Прямий виклик** `format.formatDate(invoice.issued_at)` і `format.formatDate(invoice.due_at)`. Сам рендер викликають з двох місць: `GET /invoices/:number` ([routes.js:28-37](../app/lib/invoices/routes.js#L28-L37), маршрут без `/api/`, тож заголовок `x-staff-id` не потрібен) і CLI `bin/render-invoice.js INV-… > invoice.html` ([render-invoice.js:22](../app/bin/render-invoice.js#L22)) | **Людина**: клієнт, який оплачує рахунок, і менеджер, який його відкриває чи пересилає | **Змінитись** на `09.03.2026`. Саме на це місце скаржиться тікет («до 03/12» читають як грудень) |
| 2 | Листи-нагадування: `body()` → `buildReminders` у [app/lib/notifications/reminders.js:40,46](../app/lib/notifications/reminders.js#L40) («мав бути сплачений до …», «слід сплатити до …») | **Прямий виклик** `format.formatDate(invoice.due_at)`. Ланцюжок: cron 09:00 у робочі дні → `bin/send-reminders.js:20` → `buildReminders` → файли `out/mail/<дата>-<вид>-<id>.txt` → SMTP-релей сам забирає їх і відправляє | **Людина**: клієнт читає текст листа. SMTP-релей лише передає файл і не розбирає дату в тексті | **Змінитись** на `дд.мм.рррр`. Тікет прямо згадує «сплатити до 03/12/2026» у листах |
| 3 | CSV для «Облік-Плюс»: `cell()` у [app/lib/export/accounting.js:29-35](../app/lib/export/accounting.js#L29-L35), колонки `DocDate` (`issued_at`) і `PayUntil` (`due_at`) | **Неявно, через конфіг.** Ім'я функції в коді не згадується: функцію-форматер шукають рядком `format['format' + col.type]`, а тип береться з [app/config/export-columns.json:3-4](../app/config/export-columns.json#L3-L4) (`"type": "Date"` → `formatDate`). Ланцюжок: cron 02:30 → `bin/nightly-export.js:25` → `buildAccountingFile` → `out/export/oblik-YYYY-MM-DD.csv` → сервер «Облік-Плюс» забирає файл о 06:00. Бухгалтерія може переставляти колонки в цьому JSON без деплою, тож кожна колонка з типом `Date` (і нинішня, і майбутня) теж піде через `formatDate` | **Інша система**: імпорт «Облік-Плюс». Його сервер працює з американською локаллю і чекає **`MM/DD/YYYY`** ([app/docs/integrations/oblik-plus.md:23](../app/docs/integrations/oblik-plus.md)) | **Лишитись як є** (`03/09/2026`). Рядок з датою в іншому форматі «Облік-Плюс» **мовчки пропускає**: у нас немає помилки, від них немає листа. У лютому 2021 так «зникли» 40 рахунків, і помітили це лише через три тижні. Зміну формату треба зробити так, щоб цей файл не змінився ні на байт. Якщо колись знадобиться інший формат і тут, бухгалтерію треба попередити мінімум за тиждень |
| 4 | Тест `rendered invoice shows number, customer, dates and totals` у [app/test/invoices.test.js:41-42](../app/test/invoices.test.js#L41-L42) | Опосередковано через `renderInvoiceHtml` (рядок 1). Перевіряє `Дата: <b>03/09/2026</b>` і `Сплатити до: <b>03/23/2026</b>` | Розробники та CI | **Змінитись**: після тікета тест почервоніє, і так має бути, бо зміна вихідних даних тут бажана. Очікування треба оновити на `09.03.2026` / `23.03.2026` |

**Схожі місця, які зміна `formatDate` не зачіпає** (перевірено, щоб не
переробити зайвого):

- JSON API (`/api/invoices`, `/api/customers/:id/invoices`, `/api/orders`…)
  віддає дати як є, у `YYYY-MM-DD`, без `formatDate`.
- Звіти ([app/lib/reports/](../app/lib/reports/)) мають власний `dates.js`:
  `monthName` дає «березень 2026», а дати в тексті дебіторки виводяться в ISO.
  Через `lib/format` вони не проходять, тож BI-таблиця й місячний лист не
  зміняться.
- `dmy()` у [app/lib/legacy/templates.js:180-184](../app/lib/legacy/templates.js#L180-L184)
  уже форматує `дд.мм.рррр`, але це мертвий код. Його ніхто не `require`, а
  каталогу `templates/` немає.
- Імена файлів листів і експорту (`today` у ISO), розбір дат у банківській
  виписці (`statement.js`), вивід `bin/import-statement.js` до `formatDate` не
  звертаються.
- [app/test/reminders.test.js](../app/test/reminders.test.js) дату в тексті
  листа не перевіряє, а [app/test/format.test.js](../app/test/format.test.js)
  не тестує `formatDate` взагалі. Тестів на експорт немає. Отже, зараз ці
  споживачі **нічим не захищені**, і першими треба написати саме ці
  характеризаційні тести (розділ 4).

## 3. Як ви їх шукали

1. **Пошук за іменем**: `grep -rn "formatDate" app/`. Знайшов лише прямі
   виклики в `invoices/render.js` і `notifications/reminders.js`.
   **Експорт цей пошук не показав.**
2. **Хто взагалі імпортує модуль**: `grep -rn "require('../format')"`.
   Знайшов третій модуль, `lib/export/accounting.js`, де `formatDate` за
   іменем не згадується.
3. **Як саме він викликає форматер**: `grep -rn "format\["` →
   `accounting.js:30`, `format['format' + col.type]`. Далі подивився типи
   колонок у `config/export-columns.json`: дві колонки мають `"type": "Date"`.
   Отже, зв'язок задає конфіг, а не код.
4. **Звідки викликають кожного споживача**: grep по експортованих функціях
   (`renderInvoiceHtml`, `buildReminders`, `buildAccountingFile`) знайшов
   HTTP-маршрут, три скрипти в `bin/` і тести. Хто й коли їх запускає, видно з
   коментарів про cron у `bin/*.js`, а хто читає результат — з
   `app/docs/integrations/oblik-plus.md` і коментаря в `send-reminders.js`.
5. **Перевірка запуском**:
   - `node bin/render-invoice.js INV-2026-00007` → `Дата: <b>03/07/2026</b>`.
   - `buildAccountingFile` на поточних даних (у пам'яті, без запису файлу) →
     `INV-2026-00001;03/01/2026;03/15/2026;…`.
   Отже, експорт справді проходить через `formatDate`.
6. **Тести**: `grep` по `test/` знайшов, які тести зараз фіксують формат дати
   (лише `invoices.test.js:41-42`), а які ні.

## 4. Характеризаційні тести

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `app/test/characterization/date-consumers.test.js` → `formatDate: current output, including the odd cases` | сам `formatDate`: `MM/DD/YYYY`, timestamp і `Date` (UTC), неіснуючий день `2026-02-30` → `03/02/2026` (перекочується в березень), порожні та некоректні значення → `''` | так |
| … → `invoice HTML for every fixture invoice matches the golden master` | споживач 1: HTML усіх 36 рахунків з `data/` проти `golden/invoices.html.txt` | так |
| … → `invoice HTML: date line as it is today` | споживач 1: рядок `Дата: 03/07/2026 · Сплатити до: 03/21/2026` для `INV-2026-00007` | так |
| … → `reminder mails for 2026-03-12 match the golden master` | споживач 2: 6 листів (2 «нагадування», 4 «прострочено») у форматі файлів `out/mail` проти `golden/reminders-2026-03-12.txt` | так |
| … → `reminder mails: due date wording as it is today` | споживач 2: «слід сплатити до 03/12/2026» і «мав бути сплачений до 03/12/2026» | так |
| … → `accounting export file matches the golden master byte for byte` | споживач 3: CSV «Облік-Плюс» побайтово проти `golden/oblik-export.csv` (CRLF, `;`, UTF-8) | так |
| … → `accounting export: MM/DD/YYYY dates, ";" and CRLF, as Облік-Плюс expects` | споживач 3: заголовок, перший рядок, CRLF, усі `DocDate`/`PayUntil` у `MM/DD/YYYY`.  | так |
| `app/test/invoices.test.js` → `rendered invoice shows number, customer, dates and totals` (існував) | споживач 1, дати `03/09/2026`, `03/23/2026` | так |

Еталони перегенеровуються командою `UPDATE_GOLDEN=1 npm test` (diff перед комітом
переглянути обов'язково). `golden/.gitattributes` (`* -text`) не дає git
перетворити CRLF в еталоні експорту при `core.autocrlf=true`.

Перевірка, що тести справді ловлять зміну: `formatDate` підмінили через
`node --require` на «наївний фікс» `дд.мм.рррр` (код у `lib/` не змінювали).
Почервоніли всі 7 нових тестів і старий `invoices.test.js:37`, решта лишилась
зеленою.

Коміт із тестами (до зміни): `c2f11c6`

## 5. Після зміни (Task C)

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| `formatDate: current output, including the odd cases` | ні | — `formatDate` не змінювали | нічого |
| `invoice HTML for every fixture invoice matches the golden master` | так | очікувано: тікет вимагає `дд.мм.рррр` у рахунку | `UPDATE_GOLDEN=1`, перевірили diff еталона: змінилися лише 72 дати (36 рахунків × 2), більше нічого |
| `invoice HTML: date line as it is today` | так | очікувано | очікування → `07.03.2026` / `21.03.2026`, тест перейменовано на `… in DD.MM.YYYY (BILL-482)` |
| `reminder mails for 2026-03-12 match the golden master` | так | очікувано: тікет прямо згадує листи | `UPDATE_GOLDEN=1`, diff: змінилися лише 6 дат у тексті листів |
| `reminder mails: due date wording as it is today` | так | очікувано | очікування → `12.03.2026`, тест перейменовано |
| `accounting export file matches the golden master byte for byte` | **ні** | — так і мало бути: «Облік-Плюс» чекає `MM/DD/YYYY` | нічого; еталон експорту не змінювався |
| `accounting export: MM/DD/YYYY dates, ";" and CRLF, …` | **ні** | — так і мало бути | нічого |
| `invoices.test.js` → `rendered invoice shows number, customer, dates and totals` | так | очікувано | очікування → `09.03.2026` / `23.03.2026` |
| нові: `format.test.js` → `formatDateUa: DD.MM.YYYY for customers (BILL-482)` | — | — | додано |

**Як зроблено.** `formatDate` лишилась `MM/DD/YYYY`: це формат колонки типу
`Date` в експорті «Облік-Плюс», і її JSDoc тепер про це прямо попереджає
(раніше він помилково обіцяв «ISO»). Поруч додано `formatDateUa` (`дд.мм.рррр`),
і на неї переведено лише два місця, які читають клієнти:
`invoices/render.js:38-39` і `notifications/reminders.js:40,46`.
`config/export-columns.json` і `export/accounting.js` не змінювались.

Підсумок: `npm test` → 114/114 (до тікета 113 + новий тест `formatDateUa`).
Почервоніли рівно 5 тестів, і всі на споживачах, яким за тікетом і треба було
змінитися. Жодної регресії.
