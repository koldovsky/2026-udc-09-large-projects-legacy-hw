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

## 5. Після зміни (Task C)

**Що зроблено.** `lib/format.js#formatDate` **не змінено**: його поведінку читає «Облік-Плюс» через тип колонки `Date`. Поряд додано `formatDisplayDate` → `дд.мм.рррр`, і на неї переведено **лише** двох людських споживачів: `lib/invoices/render.js:38-39` і `lib/notifications/reminders.js:40,46`. Докстрінг `formatDate` виправлено. Він стверджував «returns the date in ISO format», а тепер пояснює, що це формат для експорту і чому його не можна чіпати. Конфіг `config/export-columns.json`, `lib/export/accounting.js` і `app/data/*.json` не змінювались.

> Чому не «змінити `formatDate` і додати `formatUsDate` для експорту»: тоді довелося б міняти `type` у `config/export-columns.json`. Документ інтеграції каже, що цей файл бухгалтерія правує сама і «типи колонок не міняти», тож диф зачепив би машинний контракт. Обраний варіант залишає машинний шлях недоторканим.

Прогін після зміни, до оновлення очікувань: `tests 116, pass 110, fail 6` (116 — разом із новим тестом `formatDisplayDate` у `test/format.test.js`). Почервоніли рівно людські виходи, усі три тести експорту лишились зеленими.

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| `characterization/dates.test.js` → `formatDate: current output is MM/DD/YYYY in UTC` | ні | — (спільний хелпер, і через нього експорт, не мав змінитись) | нічого |
| `characterization` → `invoice HTML for INV-2026-00007 …` | **так** | **Очікувано**: HTML-рахунок читає клієнт, тікет просить `дд.мм.рррр` | Еталон `golden/invoice-INV-2026-00007.html` перегенеровано (`UPDATE_GOLDEN=1`). Диф еталона: рівно 2 підстановки, `03/07/2026` → `07.03.2026` і `03/21/2026` → `21.03.2026`, решта HTML байт-у-байт та сама |
| `characterization` → `GET /invoices/:number serves the same HTML` | **так** | **Очікувано**: та сама сторінка, посилання з тікета | Той самий еталон |
| `characterization` → `bin/render-invoice.js prints the same HTML` | **так** | **Очікувано**: той самий рахунок через CLI | Той самий еталон |
| `characterization` → `reminder mails for 2026-03-13 …` | **так** | **Очікувано**: листи читає клієнт, тікет прямо згадує «сплатити до 03/12/2026» | Еталон `golden/reminders-2026-03-13.json` перегенеровано. Диф: 7 рядків `text`, у кожному змінилась тільки дата (`03/16/2026` → `16.03.2026`, `02/21/2026` → `21.02.2026` тощо). `to`, `subject`, `kind`, суми не змінились |
| `characterization` → `bin/send-reminders.js writes the same mails to the outbox` | **так** | **Очікувано**: ті самі листи, але вже як файли, які cron кладе для SMTP-relay; relay текст не розбирає, читає клієнт | Еталон `golden/outbox-2026-03-13.txt` перегенеровано. Диф: у 7 рядках «до …» змінилась лише дата (`03/16/2026` → `16.03.2026` тощо). Імена файлів, `To:`, `Subject:`, суми не змінились |
| `characterization` → `accounting CSV for Облік-Плюс matches the golden master byte for byte` | **ні** | — (машинний вихід, мав лишитись) | Нічого. `git diff -- app/test/characterization/golden/oblik-export.csv` порожній |
| `characterization` → `bin/nightly-export.js writes the same file` | **ні** | — | нічого |
| `characterization` → `accounting CSV: date columns are MM/DD/YYYY` | **ні** | — | нічого |
| `test/invoices.test.js` → `rendered invoice shows number, customer, dates and totals` (засіяний) | **так** | **Очікувано**: це саме той вихід, на який скаржиться тікет (`03/09/2026` → `09.03.2026`) | Змінено **лише** два `assert.match` з датами (`03\/09\/2026` → `09\.03\.2026`, `03\/23\/2026` → `23\.03\.2026`) і додано коментар `BILL-482`. Решту перевірок тесту не чіпав |
| `test/format.test.js` → новий `formatDisplayDate: DD.MM.YYYY for people (BILL-482)` | — (новий) | — | Додано: фіксує новий хелпер, включно з порожнім і невалідним входом, як у `formatDate` |
| Решта 105 засіяних тестів | ні | — | нічого |

Підсумок: `cd app && npm test` → `tests 116, pass 116, fail 0`. Машинний вихід (CSV для «Облік-Плюс») байт-у-байт той самий, бухгалтерію попереджати не треба. Пізніше в Task E додано ще один характеризаційний тест (незалежність від часового поясу, `docs/task-e-bonus.md`), тому зараз `tests 117, pass 117`.
