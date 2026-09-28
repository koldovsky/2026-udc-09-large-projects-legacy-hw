# Task E (bonus) — Шлях 1: три способи навігації

Одне й те саме питання — «хто залежить від того, як форматуються дати?» — трьома способами.

## Результати

| Спосіб | Що знайшов | Чого не знайшов | Вартість (виклики / токени / хв) |
|---|---|---|---|
| Текстовий пошук (`grep -rn "formatDate"`) | `invoices/render.js:38-39` (прямий виклик), `notifications/reminders.js:40,46` (прямий виклик), декларацію у `format.js`, тести | **`export/accounting.js`** — динамічний виклик `format['format' + col.type]` не містить літералу `formatDate` | 1 виклик, ~0 токенів, <1 сек |
| Субагент (Explore) | Усіх 3 споживачів: `render.js:38,39` (прямий), `reminders.js:40,46` (прямий), `accounting.js:30` (динамічний dispatch) + downstream consumers (routes, bin scripts) | Нічого не пропустив | 18 викликів, ~49 000 токенів, ~100 сек |
| Семантичний інструмент (IDE Call Hierarchy через MCP) | Тільки саму функцію `formatDate` і її самоссилання в exports | **Обидва прямих споживачі** (render.js, reminders.js) — IDE не побачив їх через CommonJS `require('../format')` без TypeScript типів; і звісно **accounting.js** з динамічним dispatch | 2 виклики, ~500 токенів, <2 сек |

## Деталі по кожному способу

### 1. Текстовий пошук (grep)

```bash
grep -rn "formatDate" app/lib/ app/bin/ --include="*.js"
```

Знайшов:
- `lib/invoices/render.js:38,39` — `format.formatDate(invoice.issued_at)` і `format.formatDate(invoice.due_at)`
- `lib/notifications/reminders.js:40,46` — `format.formatDate(invoice.due_at)` у тілі листа

Не знайшов:
- `lib/export/accounting.js:30` — `format['format' + col.type]` де `col.type === 'Date'` (з `config/export-columns.json`)

**Чому:** grep шукає літеральний рядок. Ім'я `formatDate` конструюється динамічно з `'format' + 'Date'`, тому grep його не бачить.

Додатковий grep `grep -rn "require.*format" app/lib/` знайшов би імпорт в `accounting.js`, але без розуміння контексту не пов'язав би з `formatDate`.

### 2. Субагент / Explore

Explore-агент отримав задачу «знайти ВСІ шляхи коду, що споживають вихід `formatDate`». Використав 18 tool calls (~49 000 токенів, ~100 сек).

Знайшов:
- `lib/invoices/render.js:38,39` — прямий виклик (через grep/search)
- `lib/notifications/reminders.js:40,46` — прямий виклик (через grep/search)
- `lib/export/accounting.js:30` — **динамічний dispatch** `format['format' + col.type]` (знайшов через аналіз усіх імпортерів `format.js`)
- Downstream consumers: `bin/render-invoice.js`, `bin/send-reminders.js`, `bin/nightly-export.js`, `lib/invoices/routes.js`

Також правильно визначив, що `test/format.test.js` імпортує `format.js`, але не тестує `formatDate`.

Explore-агент — єдиний, хто знайшов усіх споживачів, включаючи прихованого. Він зробив це, розширивши пошук від `formatDate` до всіх `require('../format')` і проаналізувавши кожен файл-імпортер.

### 3. Семантичний інструмент (IDE Call Hierarchy / MCP)

Використано `analyze_calls(symbolFqn="formatDate(value)", analysisKind="INCOMING_CALLS")` через JetBrains MCP.

Результат: лише самоссилання у `format.js`. IDE не побудував call hierarchy для CommonJS-модуля без TypeScript типів. Це очікувано — статичний аналіз JavaScript без типів не може відстежити:
- `var format = require('../format'); format.formatDate(...)` — без .d.ts IDE не бачить зв'язку
- `format['format' + col.type]` — динамічний property access не відстежується жодним статичним аналізатором

### Висновок

| Спосіб | Знайшов прямих | Знайшов прихованого | Повнота |
|---|---|---|---|
| grep | 2/2 | 0/1 | 66% |
| Explore (субагент) | 2/2 | 1/1 | 100% |
| IDE Call Hierarchy | 0/2 | 0/1 | 0% |

**Жоден одиничний метод не достатній.** Grep швидкий і знаходить прямі виклики, але сліпий до динамічного dispatch. IDE Call Hierarchy для нетипізованого CommonJS-коду практично непрацездатний. Субагент (LLM) — єдиний, хто може «зрозуміти» динамічний виклик, але він найдорожчий і найповільніший.

**Найефективніша стратегія:** grep за іменем функції → grep за імпортами модуля → ручний аналіз кожного імпортера. Це те, що людина-розробник і зробила б, і це те, що ми зробили в Task B.
