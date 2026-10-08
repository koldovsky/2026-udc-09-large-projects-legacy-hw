# AGENTS.md — prykladpostach-billing

Читати **до** будь-якої зміни в `app/`. Тут лише те, чого не видно з коду одразу.

## Стек — не довіряй `docs/ARCHITECTURE.md`

`docs/ARCHITECTURE.md` (2019) застарів майже повністю. Насправді:

- Node ≥22, CommonJS, колбеки, **0 npm-залежностей**.
- Замість Express — власний роутер `lib/http/router.js`.
- Замість MongoDB — JSON-файли в `data/` через `lib/store.js`.
- Handlebars, `templates/` і PDF-сервісу вже немає.
- Порт 8080 (`config/default.json`), а не 3000.

Не переписуй на ESM чи async/await і не додавай залежностей.

`npm test` запускає всі тести, `npm start` піднімає сервер. Фікстури `data/*.json` спільні для тестів, **не редагуй їх**.

## Контракт з «Облік-Плюс» — найнебезпечніше місце

- `bin/nightly-export.js` (cron 02:30) пише `out/export/oblik-YYYY-MM-DD.csv`, бухгалтерія забирає файл о 06:00. Формат строгий: `;`, CRLF, дата **`MM/DD/YYYY`**, суми `1234.50` (`docs/integrations/oblik-plus.md`).
- Рядок з датою в іншому форматі «Облік-Плюс» **мовчки пропускає**: ні помилки, ні листа. Так у 2021 «зникли» 40 рахунків.
- Клітинки рендерить `lib/export/accounting.js:30` як **`format['format' + col.type]`**, а типи колонок задано в `config/export-columns.json`. Тому **`grep formatDate` / `grep formatDecimal` цього споживача не знаходить**. Шукай споживачів `lib/format.js` за імпортом: `grep -rn "require('../format')" lib bin`.
- Типи колонок у `export-columns.json` не міняй: бухгалтерія може переставляти колонки, але типи — частина контракту.
- Вихід захищає golden master `test/golden/oblik-export.csv` (`test/characterization/bill-482.test.js`). **Якщо він почервонів — це регресія, а не «оновити еталон».**

## Дати

| Функція | Формат | Хто читає |
|---|---|---|
| `format.formatDateUa` | `дд.мм.рррр` | Клієнти: HTML-рахунок (`lib/invoices/render.js`), листи-нагадування (`lib/notifications/reminders.js`) — BILL-482 |
| `format.formatDate` | `MM/DD/YYYY` | **Лише** експорт «Облік-Плюс» (через тип колонки `Date`).|

- У даних дати зберігаються як `YYYY-MM-DD` (UTC, без часу).
- Звіти (`lib/reports/dates.js`) і JSON API мають свої форматери або віддають ISO як є: `lib/format.js` їх не зачіпає.
- Будь-яка зміна в `lib/format.js` зачіпає експорт, тож спершу проганяй characterization-тести.

## Пастки

- **Тестів на `lib/export/accounting.js` у засіяному наборі не було.** Якщо змінити `formatDate` «в лоб», усі 106 тестів лишаються зеленими. Перевірено контрольним прогоном (`docs/ai-on-legacy.md` у корені репо).
- `GET /invoices/:number` повертає HTML клієнту, і заголовок `x-staff-id` для нього не потрібен (`router.js:101` перевіряє лише `/api/*`).
- **Мертвий код, не чіпай:**
  - `lib/discounts/` нікуди не підключений, прапорець `loyaltyDiscounts` ні на що не впливає;
  - `lib/legacy/*`;
  - `lib/customers/merge.js` (`planMerge`) викликають лише тести.
- `audit.record()` існує, але **жоден модуль його не викликає**, хоч коментар у `lib/audit/routes.js:2-3` стверджує протилежне.
- `bin/fix-2022-duplicate-customers.js` — разовий фікс, уже застосований на проді. **Не запускати.**
- `bin/import-statement.js` більше не стоїть у cron, хоч коментарі й старі доки кажуть інакше: його запускають вручну.
