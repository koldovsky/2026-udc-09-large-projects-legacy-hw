# Task E (bonus) — оберіть ОДИН шлях

> Скопіюйте у `docs/task-e-bonus.md` і заповніть лише обраний розділ.

## Шлях 1 — три способи навігації

Одне й те саме питання — «хто залежить від того, як форматуються дати?» — трьома способами:

| Спосіб | Що знайшов | Чого не знайшов | Вартість (виклики / токени / хв) |
|---|---|---|---|
| **Текстовий пошук (grep/ripgrep/Select-String)** | 1. Визначення `formatDate` в `lib/format.js:29,77`<br>2. 3 імпортери `require('../format')`: `lib/export/accounting.js:9`, `lib/invoices/render.js:7`, `lib/notifications/reminders.js:4`<br>3. `lib/legacy/templates.js:180-184` — окрема функція `dmy()` з хелпером `'date'` (знайшов пошуком `toISOString\|getUTCMonth\|pad2` по всьому коду) | 1. **Динамічні виклики** у `lib/export/accounting.js:30`: `format['format' + col.type]` де `col.type="Date"` з `config/export-columns.json`<br>2. Виклики через змінну `format.formatDate()` в `render.js:38-39` і `reminders.js:40,46` — grep по `"formatDate"` їх не ловить<br>3. `lib/reports/dates.js` — власні хелпери `monthName()`, `toIsoDate()` (не пов'язані з `formatDate`) | ~15 викликів Select-String / 2 хв |
| **Субагент / Explore (делегація)** | Якби я delegатив це окремому агенту з промптом "знайди всіх споживачів форматування дат у app/", він би:<br>1. Прочитав `lib/format.js` як точку входу<br>2. Знайшов усі імпортери `require('../format')`<br>3. Проаналізував кожен імпортер на використання `formatDate` / `formatDateClient` / `formatDecimal`<br>4. Перевірив `config/export-columns.json` на типи колонок<br>5. Знайшов `lib/legacy/templates.js` через пошук інших дат-хелперів | Той самий ризик — якщо агент не знає про динамічні виклики (`format['format'+type]`), він їх пропустить. Треба явно вказати в промпті: "шукай і динамічні виклики, і власні форматтери в інших модулях" | 1 subagent run / ~30 сек / менш токенів у головного агента |
| **Семантичний інструмент (LSP / ast-grep / TypeScript language server)** | Не доступний у цьому середовищі (plain Node.js, CommonJS, без TS, без LSP).<br><br>Теоретично `ast-grep` з правилом `formatDate($X)` знайшло б:<br>- Прямі виклики: `format.formatDate(...)`<br>- Метод змінної: `format.formatDate(...)`<br>Але **НЕ знайшло б**:<br>- Динамічний доступ: `format['format' + col.type]`<br>- Власну функцію `dmy()` в `legacy/templates.js` (різне ім'я)<br>- `formatDecimal` виклики (різне ім'я) | 1. Динамічні property access (ast-grep не розуміє runtime значення `col.type`)<br>2. Крос-модульні залежності без явного імпорту<br>3. Рядкові шаблони в конфігах (`export-columns.json` → `accounting.js`) | N/A — не встановлено |

### Висновок

**Найефективніший у цьому репо — комбінація:**  
1. **Спочатку** — `grep` по імені функції + `grep` по `require('../format')` (швидко знаходить явних імпортерів)  
2. **Потім** — ручний аналіз кожного імпортера на динамічні виклики (`format['format' + ...]`)  
3. **Окремо** — пошук *інших* дат-хелперів (`toISOString`, `getUTCMonth`, `pad2`, `monthName`) щоб не пропустити `legacy/templates.js` і `reports/dates.js`

`grep` поодинці **недостатній** — пропускає динамічні виклики і власні форматтери в інших модулях.  
Subagent з правильним промптом — найкраще співвідношення якості/час, але треба чітко сформулювати завдання.  
LSP/ast-grep — ідеально для статично типізованих кодів (TS, Java), слабо працює з динамічним JS/CommonJS.