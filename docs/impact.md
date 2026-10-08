# Аналіз впливу — BILL-482

> Task B. Заповнюється **до** зміни коду.

## 1. Що саме змінюється

Функція `formatDate` у `lib/format.js:29-34` зараз повертає дати у форматі `MM/DD/YYYY` (наприклад, `03/09/2026`). Після тікета дати, які бачать клієнти, мають бути у форматі `DD.MM.YYYY` (наприклад, `09.03.2026`).

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | `lib/invoices/render.js:38-39` | Прямий виклик `format.formatDate(invoice.issued_at)` і `format.formatDate(invoice.due_at)` у HTML-рахунку | **Людина** (клієнт бачить HTML-рахунок у браузері) | Змінитись на DD.MM.YYYY — саме це просить тікет |
| 2 | `lib/notifications/reminders.js:40,46` | Прямий виклик `format.formatDate(invoice.due_at)` у тексті листа-нагадування (overdue і upcoming) | **Людина** (клієнт отримує email) | Змінитись на DD.MM.YYYY — тікет згадує «листи-нагадування» |
| 3 | `lib/export/accounting.js:30` | **Динамічний** виклик `format['format' + col.type]` де `col.type === 'Date'` (з `config/export-columns.json`), що резолвиться у `format.formatDate` | **Інша система** — сервер «Облік-Плюс» з американською локаллю, який очікує `MM/DD/YYYY` | **Лишитись як є** — зміна зламає імпорт, рядки мовчки пропускатимуться (інцидент лютого 2021, див. `docs/integrations/oblik-plus.md:29-31`) |

## 3. Як ви їх шукали

1. **Пошук за іменем:** `search_text("formatDate")` по `app/**` — знайшов прямих споживачів: `invoices/render.js` і `notifications/reminders.js`.
2. **Пошук за імпортом:** `search_regex("require.*format")` — знайшов три модулі, що імпортують `format.js`: `invoices/render.js`, `notifications/reminders.js`, `export/accounting.js`.
3. **Аналіз прихованого споживача:** `export/accounting.js` імпортує `format.js`, але **не** викликає `formatDate` за іменем. Рядок 30: `format['format' + col.type]` — динамічний виклик, де тип береться з конфігу. Перевірка `config/export-columns.json` показала `"type": "Date"` для полів `issued_at` і `due_at` → це резолвиться у `format.formatDate`.
4. **Що НЕ знайшов grep:** саме `export/accounting.js` — пошук за `formatDate` його не показує, бо ім'я конструюється динамічно.
5. **Додаткова перевірка:** `lib/reports/` НЕ використовує `format.js` — у звітах свої хелпери (`reports/dates.js`), дати відображаються як raw ISO `YYYY-MM-DD`. `lib/legacy/templates.js` має `dmy()` хелпер з DD.MM.YYYY, але це мертвий код.

## 4. Характеризаційні тести

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `app/test/characterization.test.js` — «formatDate produces MM/DD/YYYY» | Поточний вихід formatDate | Так |
| `app/test/characterization.test.js` — «invoice HTML contains dates in current format» | Дати в HTML-рахунку | Так |
| `app/test/characterization.test.js` — «reminder body contains due date in current format» | Дата в тексті нагадування | Так |
| `app/test/characterization.test.js` — «accounting CSV contains dates in MM/DD/YYYY» | Дати в CSV для «Облік-Плюс» | Так |

Коміт із тестами (до зміни): `145f721`

## 5. Після зміни (Task C)

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| «formatDate produces MM/DD/YYYY» | Так | **Очікувано** — formatDate тепер повертає DD.MM.YYYY для клієнтських дат | Оновили очікування на DD.MM.YYYY |
| «invoice HTML contains dates in current format» | Так | **Очікувано** — HTML-рахунок тепер показує DD.MM.YYYY | Оновили очікування на DD.MM.YYYY |
| «reminder body contains due date in current format» | Так | **Очікувано** — текст нагадування тепер має DD.MM.YYYY | Оновили очікування на DD.MM.YYYY |
| «accounting CSV contains dates in MM/DD/YYYY» | **Ні** | Не повинен червоніти — експорт для системи «Облік-Плюс» має зберегти MM/DD/YYYY | Нічого — тест залишився зеленим |
