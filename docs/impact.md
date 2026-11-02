# Аналіз впливу — BILL-482

## 1. Що саме змінюється

Дати, які **читають люди**, мають іти у форматі `дд.мм.рррр` (`09.03.2026`) замість `MM/DD/YYYY` (`03/09/2026`). Це HTML-рахунок і листи-нагадування про оплату. Дати, які **читає інша система**, тобто нічний CSV для «Облік-Плюс», мають лишитися байт-у-байт такими, як були (`MM/DD/YYYY`). Тому спільний `lib/format.js#formatDate` **не можна змінювати на місці**.

## 2. Хто від цього залежить

Споживачі поведінки `lib/format.js#formatDate`, тобто все, що зміниться, якщо поміняти цю функцію на місці:

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | `lib/invoices/render.js:38-39` → `renderInvoiceHtml` | Прямий виклик `format.formatDate(invoice.issued_at / due_at)` | **Людина**: клієнт бачить «Дата» і «Сплатити до» | **Змінитись** на `дд.мм.рррр`. Це суть тікета |
| 1a | `lib/invoices/routes.js:28-37` → `GET /invoices/:number` | Через `render.renderInvoiceHtml` | **Людина** (браузер клієнта, посилання з тікета `/invoices/INV-2026-00007`) | Змінитись (успадковує № 1) |
| 1b | `bin/render-invoice.js` | Через `render.renderInvoiceHtml`, stdout → файл `.html` | **Людина** (рахунок, збережений вручну) | Змінитись (успадковує № 1) |
| 2 | `lib/notifications/reminders.js:40,46` → `buildReminders` | Прямий виклик `format.formatDate(invoice.due_at)` у тексті листа (обидва види: `upcoming` і `overdue`) | **Людина**: клієнт читає «сплатити до …» | **Змінитись** на `дд.мм.рррр`. Тікет прямо називає листи |
| 2a | `bin/send-reminders.js` (cron 09:00) → `out/mail/*.txt` → SMTP-relay | Через `reminders.buildReminders` | Relay **не розбирає** текст, лише пересилає файл. Читає **людина** | Змінитись (успадковує № 2). Ім'я файлу (`today` в ISO) не зачеплене |
| 3 | `lib/export/accounting.js:29-35` → `buildAccountingFile` | **Не прямим викликом**: `format['format' + col.type]`, де `type: "Date"` береться з `config/export-columns.json:3-4` (колонки `DocDate`, `PayUntil`). Рядка `formatDate` у файлі немає | **Інша система**: «Облік-Плюс» імпортує CSV о 06:00, американська локаль, **рядки з іншим форматом дати мовчки пропускає** (`app/docs/integrations/oblik-plus.md`) | **Лишитися як є**, байт-у-байт `MM/DD/YYYY` |
| 3a | `bin/nightly-export.js` (cron 02:30) → `out/export/oblik-YYYY-MM-DD.csv` | Через `accounting.buildAccountingFile` | **Інша система** (той самий файл) | Лишитися як є |

Пов'язане, але **не** залежить від `lib/format.js#formatDate` (перевірено, щоб не зачепити випадково):

| Місце | Чому не в списку |
|---|---|
| `GET /api/invoices`, `/api/invoices/:id` (`lib/invoices/routes.js:9-26`) | Віддають сирі ISO-рядки з `data/invoices.json`, нічого не форматують |
| `lib/reports/*`, `bin/monthly-report.js` | Власні `reports/dates.js` і `reports/table.js`, `lib/format.js` не імпортують |
| `lib/legacy/templates.js` (хелпер `date` → `dmy`) | Мертвий код, `templates/` немає з 2020. До речі, він уже форматував `дд.мм.рррр` |
| `lib/payments/statement.js` | Парсить вхідні дати банку `DDMMYYYY`, не форматує вихід |
| Інші хелпери `lib/format.js` (`formatMoney`, `formatDecimal`, `formatText`, `formatPercent`) | Тікет їх не стосується, не змінюються |

## 3. Як ви їх шукали

1. `grep -rn "formatDate" lib bin` знайшов лише **№ 1 і № 2** (`invoices/render.js`, `reminders.js`).
2. `grep -rn "require('.*format')" lib bin` знайшов **трьох** імпортерів `lib/format.js`, серед них `lib/export/accounting.js`. В останньому `formatDate` немає, тому я прочитав файл повністю і знайшов `format['format' + col.type]` (рядок 30). Тоді відкрив `config/export-columns.json`: дві колонки мають `"type": "Date"`. Це і є **№ 3**, якого пошук за іменем функції не показує.
3. Перевірив, чи немає інших динамічних звертань: `grep -rn "format\[" lib bin` → лише `accounting.js:30`; `grep -rn "require(" server.js` → `require(m)` у `server.js:24` підключає лише `lib/*/routes`. Жоден `routes` не форматує дати, крім `invoices/routes.js` через `render`.
4. Пройшовся вгору по графу викликів від кожного прямого споживача (`grep -rn "invoices/render\|notifications/reminders\|export/accounting" lib bin server.js`), так знайшлися **1a, 1b, 2a, 3a**.
5. Хто читає вихід, взяв із коду (`bin/*` коментарі про cron, relay, шару бухгалтерії) і з `app/docs/integrations/oblik-plus.md`. Цей документ, на відміну від `ARCHITECTURE.md`, узгоджується з кодом: шлях `out/export/oblik-*.csv`, роздільник `;`, CRLF, формат сум `formatDecimal`.

## 4. Характеризаційні тести

Файл: `app/test/characterization/dates.test.js`. Еталони (golden master) лежать в `app/test/characterization/golden/`. Порівняння **байт-у-байт**. Для еталонів `.gitattributes` ставить `-text`, щоб `core.autocrlf` на Windows не переписав CRLF у CSV і LF в інших файлах. Перегенерація: `UPDATE_GOLDEN=1 node --test test/characterization/dates.test.js`.

**Ізоляція від робочих даних.** Входи — заморожені копії в `app/test/characterization/fixtures/` (байт-у-байт копії `app/data/invoices.json` і `customers.json`), бо `app/data/*.json` застосунок сам перезаписує (`store.save`). Маршрут читає їх через `store.open(FIXTURES)`. Cron/CLI-скрипти запускаються в тимчасовій копії застосунку (`lib/`, `bin/`, `config/`, `package.json`, а `data/` = фікстури), яку тест потім видаляє. Тести не читають і не пишуть `app/data` чи `app/out`, тож зіткнень імен файлів немає.

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `formatDate: current output is MM/DD/YYYY in UTC` | Сам спільний хелпер: ISO-рядок, рядок з часом і поясом, `Date`, порожні та невалідні значення | так |
| `invoice HTML for INV-2026-00007 matches the golden master` | № 1, повний HTML рахунку → `golden/invoice-INV-2026-00007.html` | так |
| `GET /invoices/:number serves the same HTML` | № 1a, маршрут на фікстурах (`store.open(FIXTURES)`), той самий еталон | так |
| `bin/render-invoice.js prints the same HTML` | № 1b, CLI окремим процесом у пісочниці, той самий еталон | так |
| `reminder mails for 2026-03-13 (upcoming + overdue) match the golden master` | № 2/2a, усі листи на день, де є обидва види → `golden/reminders-2026-03-13.json` (7 листів: 3 upcoming + 4 overdue) | так |
| `bin/send-reminders.js writes the same mails to the outbox (cron entry point)` | № 2a, cron-скрипт у пісочниці за `2026-03-13` пише 7 файлів у `out/mail/`; усі разом з іменами → `golden/outbox-2026-03-13.txt` (дати `MM/DD/YYYY`) | так |
| `accounting CSV for Облік-Плюс matches the golden master byte for byte` | № 3, весь файл на фікстурах (заголовок + 36 рахунків; чернеток у фікстурах немає), CRLF → `golden/oblik-export.csv` | так |
| `bin/nightly-export.js writes the same file (cron entry point)` | № 3a, cron-скрипт у пісочниці (див. нижче) пише `out/export/oblik-2026-03-13.csv`, порівнюється з тим самим еталоном | так |
| `accounting CSV: date columns are MM/DD/YYYY (…)` | № 3, явна перевірка `DocDate`/`PayUntil` = `03/09/2026` / `03/23/2026`, щоб намір був видно без диффу еталона | так |

Прогін на незміненому коді: `cd app && npm test` → `tests 115, pass 115, fail 0` (106 засіяних + 9 нових).

Коміт із тестами (до зміни): цей коміт
