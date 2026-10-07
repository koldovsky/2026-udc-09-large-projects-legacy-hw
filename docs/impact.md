# Аналіз впливу — BILL-482

> Task B. Заповнено **до** зміни коду.

## 1. Що саме змінюється

Дати, які **бачать клієнти** (HTML-рахунок і листи-нагадування), мають показуватися як `дд.мм.рррр` (`09.03.2026`), а не `MM/DD/YYYY` (`03/09/2026`). Обидва місця беруть дату зі спільної функції `lib/format.js` → `formatDate` (`format.js:29-34`). Її ж, без явного виклику за іменем, використовує нічний CSV для бухгалтерії. Там формат `MM/DD/YYYY` **має лишитися** (`app/docs/integrations/oblik-plus.md:23`).

Тому «одна функція — дрібна правка» з тікета хибна: якщо змінити `formatDate` на місці, змінився б і файл для «Облік-Плюс».

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | `lib/invoices/render.js:38-39` — `renderInvoiceHtml` | Прямий виклик `format.formatDate(invoice.issued_at / due_at)` | **Людина** (клієнт) | **Змінитись** на `дд.мм.рррр` — саме про це тікет |
| 1a | `GET /invoices/:number` (`lib/invoices/routes.js:28-36, 63`) | Через `render.renderInvoiceHtml` | Людина (клієнт, браузер) | Змінитись (успадковує від № 1) |
| 1b | `bin/render-invoice.js:22` | Через `render.renderInvoiceHtml`, HTML у stdout | Людина (HTML надсилають клієнту) | Змінитись (успадковує від № 1) |
| 2 | `lib/notifications/reminders.js:40,46` — `body()` / `buildReminders` | Прямий виклик `format.formatDate(invoice.due_at)` у тексті листа | **Людина** (клієнт) | **Змінитись** на `дд.мм.рррр` — тікет прямо згадує «сплатити до 03/12/2026» |
| 2a | `bin/send-reminders.js:20-25` (cron 09:00) | Через `reminders.buildReminders`, пише `out/mail/*.txt`, їх забирає SMTP-relay | Людина (клієнт). Relay лише пересилає текст, дату не розбирає | Змінитись (успадковує від № 2). Заголовки `To:` / `Subject:` дат не містять |
| 3 | `lib/export/accounting.js:29-35` — `cell()` у `buildAccountingFile` | **Не за іменем**: `format['format' + col.type]`, де `col.type === 'Date'` для колонок `issued_at` / `due_at` у `config/export-columns.json:3-4` | **Інша система** — «Облік-Плюс» (американська локаль, рядки з іншим форматом мовчки пропускає) | **Лишитись `MM/DD/YYYY`** байт-у-байт. Інакше повториться лютий 2021 (`oblik-plus.md:29-38`) |
| 3a | `bin/nightly-export.js:25` (cron 02:30) | Через `accounting.buildAccountingFile` → `out/export/oblik-YYYY-MM-DD.csv` | Інша система («Облік-Плюс», забирає о 06:00) | Лишитись як є (успадковує від № 3) |

**Перевірено, що НЕ залежать від `formatDate`** (форматують дати самі або не форматують):

| Місце | Чому не зачіпається |
|---|---|
| `lib/reports/*`, `bin/monthly-report.js`, `/api/reports/*` | Власний `lib/reports/dates.js`. Aging показує сирий ISO (`reports/render.js:45-46`), місяці — `monthName` («березень 2026») |
| JSON API (`/api/invoices`, `/api/customers/:id/invoices`, …) | Віддає поля з `data/*.json` як є (ISO `YYYY-MM-DD`) |
| `lib/payments/statement.js`, `bin/import-statement.js` | Вхідні дати банку `DDMMYYYY` → ISO власним `toIsoDate`. Вивід CLI показує ISO |
| `lib/legacy/templates.js` (`dmy`) | Власний хелпер (уже `дд.мм.рррр`), модуль мертвий (`pdf-client` ніхто не імпортує) |
| `lib/orders`, `lib/audit`, `lib/discounts`, `lib/customers`, `lib/catalog` | Не імпортують `lib/format.js` (`grep -rn "require('../format')" lib`) |

## 3. Як ви їх шукали

1. `grep -rn "formatDate" lib bin server.js` знайшов лише споживачів № 1 і № 2 (`invoices/render.js`, `notifications/reminders.js`). **Споживача № 3 цей пошук не показує.**
2. Пошук не за функцією, а за модулем: `grep -rn "require('../format')\|/format'" lib bin`. Він знайшов третього імпортера — `lib/export/accounting.js`, у якому рядка `formatDate` немає.
3. Читання `accounting.js:29-35`: виклик динамічний, `format['format' + col.type]`. Далі `grep -n '"Date"' config/export-columns.json` показав колонки `DocDate` і `PayUntil`. Пошук `format\[` по всьому `lib/` інших динамічних звертань не знайшов.
4. Для кожного прямого споживача — хто викликає його самого: `grep -rn "renderInvoiceHtml\|buildReminders\|buildAccountingFile" lib bin server.js` дав маршрут `/invoices/:number` і три CLI/cron-скрипти (№ 1a, 1b, 2a, 3a).
5. Хто читає результат: коментарі `bin/*.js` (cron, outbox, шара) і `app/docs/integrations/oblik-plus.md` (формат, мовчазний пропуск рядків). Підтверджено запуском: `buildAccountingFile` реально видає `03/01/2026` (Task A, розділ 3).
6. Від'ємна перевірка: усі інші місця з датами (`grep -rn "getUTC\|toLocale\|DDMMYYYY\|slice(0, 10)" lib bin`) мають власні форматери, див. таблицю вище.

## 4. Характеризаційні тести

Файл: `app/test/characterization/bill-482.test.js`. Еталони (golden master) — у `app/test/golden/`. Тести лише читають фікстури (`store.save()` ніде не викликається), `app/data/*.json` не змінюються.

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `formatDate: current output is MM/DD/YYYY …` | Сам хелпер: `2026-03-09` → `03/09/2026`, `Date`, timestamp із часом, порожні й невалідні значення → `''` | так |
| `accounting export: whole file matches the golden master` | **Увесь** CSV для «Облік-Плюс» з фікстур, байт-у-байт (`golden/oblik-export.csv`: заголовок, `;`, CRLF, дати, суми) | так |
| `accounting export: DocDate / PayUntil are MM/DD/YYYY …` | Кожен рядок експорту: колонки дат відповідають `^\d{2}/\d{2}/\d{4}$`, перший рядок — точне значення | так |
| `invoice HTML for INV-2026-00007 matches the golden master` | Повний HTML рахунку (`golden/invoice-INV-2026-00007.html`), зараз `Дата: 03/07/2026 · Сплатити до: 03/21/2026` | так |
| `bin/render-invoice.js prints the same HTML …` | CLI-шлях до того ж рендера (запуск процесу, stdout = той самий еталон) | так |
| `reminder mails for 2026-03-20 match the golden master` | Усі 18 листів на 2026-03-20 (16 overdue + 2 upcoming): адресат, тема, текст із датою (`golden/reminders-2026-03-20.json`) | так |
| *(засіяний)* `test/invoices.test.js` — `rendered invoice shows … dates` | Уже фіксує `03/09/2026` у HTML | так (почервоніє в Task C — очікувано) |

`cd app && npm test` → **112 / 112** (106 засіяних + 6 нових).

Коміт із тестами (до зміни): `28a3034`

## 5. Після зміни (Task C)

_Заповнюється в Task C._ 
