# Аналіз впливу — BILL-482

## 1. Що саме змінюється

Змінюється формат відображення дат для клієнтів з `MM/DD/YYYY` (наприклад, 03/09/2026) на український формат `DD.MM.YYYY` (наприклад, 09.03.2026) у рахунках та листах-нагадуваннях.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | `app/lib/invoices/render.js` | Прямий імпорт та виклик `format.formatDateUA(...)` | Людина (клієнт) | Змінитись на формат `DD.MM.YYYY` |
| 2 | `app/lib/notifications/reminders.js` | Прямий імпорт та виклик `format.formatDateUA(...)` | Людина (клієнт) | Змінитись на формат `DD.MM.YYYY` |
| 3 | `app/lib/export/accounting.js` | Динамічний виклик через `format['format' + col.type]` де `col.type = 'Date'` | Інша система (Бухгалтерська програма "Облік-Плюс") | Лишитись як є (змінювати не можна, щоб не зламати імпорт) |

## 3. Як ви їх шукали

- Пошук за рядком `formatDate`: показав виклики в `app/lib/invoices/render.js` та `app/lib/notifications/reminders.js`.
- Пошук за рядком `format` та аналіз експортованих функцій: показав, що `app/lib/export/accounting.js` динамічно отримує функцію для рендеру стовпця з масиву `format`: `var render = format['format' + col.type]`. У конфігурації `app/config/export-columns.json` є стовпці з типом `Date` (`issued_at`, `due_at`), тобто експорт в CSV також використовує `formatDate`.

## 4. Характеризаційні тести

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `app/test/characterization.test.js` (invoice) | HTML-рендер рахунку з конкретними датами | так |
| `app/test/characterization.test.js` (reminders) | JSON масив для відправки листів з нагадуваннями | так |
| `app/test/characterization.test.js` (accounting) | Рядок CSV-файлу експорту для бухгалтерії | так |

Коміт із тестами (до зміни): 91dbe6b

## 5. Після зміни (Task C)

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| `app/test/characterization.test.js` (invoice) | Так | Очікувано | Оновив еталонний файл (`invoice.golden.html`), оскільки формат дати тепер `DD.MM.YYYY`, як і вимагається. |
| `app/test/characterization.test.js` (reminders) | Так | Очікувано | Оновив еталонний файл (`reminders.golden.json`), оскільки нагадування мають містити нові дати для клієнтів. |
| `app/test/characterization.test.js` (accounting) | Ні | - | Нічого, експорт для іншої системи зберіг попередній формат дат `MM/DD/YYYY`. |
