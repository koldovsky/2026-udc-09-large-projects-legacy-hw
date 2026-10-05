# Аналіз впливу — BILL-482

## 1. Що саме змінюється

BILL-482 змінює відображення дат у рахунку для клієнтів: `03/09/2026`
має стати `09.03.2026`. Зміна не повинна поширитися на текстові
нагадування або на бухгалтерський CSV: обидва зараз залежать від того ж
спільного форматера, але мають зберегти поточний машинний або усталений
вихід.

## 2. Споживачі форматування дати

| # | Споживач | Шлях до форматування | Хто читає результат | Поточний формат | Після BILL-482 |
|---|---|---|---|---|---|
| 1 | HTTP HTML-рахунок: `GET /invoices/:number`, `app/lib/invoices/routes.js` | `html` → `renderInvoiceHtml` → `format.formatDate(issued_at, due_at)` | Людина | `MM/DD/YYYY` | Має стати `DD.MM.YYYY`. |
| 2 | CLI HTML-рахунок: `app/bin/render-invoice.js` | CLI → `renderInvoiceHtml` → `format.formatDate(issued_at, due_at)` | Людина | `MM/DD/YYYY` | Має стати `DD.MM.YYYY`, оскільки це той самий renderer. |
| 3 | Текстові reminders: `app/bin/send-reminders.js` | CLI → `buildReminders` → `body` → `format.formatDate(due_at)` | Людина (одержувач листа); файл доставляє поштовий relay | `MM/DD/YYYY` | Не змінювати: тікет не охоплює нагадування. |
| 4 | Бухгалтерський CSV: `app/bin/nightly-export.js` | CLI → `buildAccountingFile` → `cell` → `format['format' + col.type]` → `formatDate` для колонок з `type: "Date"` | Інша система («Облік-Плюс»), також бухгалтерія | `MM/DD/YYYY` | Не змінювати: це зовнішній машинний контракт. |

`config/export-columns.json` задає `type: "Date"` для `issued_at` і
`due_at`; тому CSV-залежність не видно за простим пошуком `formatDate`.
Документація інтеграції `docs/integrations/oblik-plus.md` вимагає
`MM/DD/YYYY` і застерігає не змінювати типи колонок.

## 3. Як знайдено залежності

Спочатку виконано цільовий пошук прямих викликів і імпортів `formatDate`.
Далі перевірено HTML-renderer, формування текстів нагадувань, CLI-точки
входу, `config/export-columns.json` та динамічний доступ до форматерів у
`lib/export/accounting.js`. Звіти і legacy-код мають власні date helpers,
тому від `lib/format.formatDate` не залежать.

## 4. Характеризаційні тести до Task C

| Тест | Що фіксує | Зелений до зміни? |
|---|---|---|
| `app/test/invoices.test.js` | Поточні дати у фінальному HTML-renderer та у HTTP HTML endpoint. | Так |
| `app/test/reminders.test.js` | Поточну дату в тексті нагадування. | Так |
| `app/test/export.test.js` | `DocDate` і `PayUntil` у фінальному CSV, включно з динамічним вибором `formatDate`. | Так |

Після Task C очікувано мають змінитися лише перевірки HTML-рахунку.
Перевірки reminders і CSV мають залишитися зеленими без зміни очікувань.

## 5. Після зміни (Task C)

Ще не виконувалося. У Task C потрібно змінити лише гілку HTML-рахунку,
зберігши зафіксовані формати reminders і CSV.
