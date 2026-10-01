# AGENTS.md — prykladpostach-billing

Прочитай **до** того, як щось міняти. Тут записане те, чого не видно з коду
явно. Деталі: `../docs/codebase-map.md`, `../docs/impact.md`.

## Контракт, який легко зламати: CSV для «Облік-Плюс»

- `bin/nightly-export.js` → `lib/export/accounting.js` → `out/export/oblik-YYYY-MM-DD.csv`.
  Файл читає **програма** бухгалтерії, людина його не дивиться.
- Формат: `;`, CRLF, UTF-8, дата **`MM/DD/YYYY`**, суми `1234.50` (`docs/integrations/oblik-plus.md`).
  Рядок з іншою датою «Облік-Плюс» **мовчки пропускає**: ні помилки, ні листа.
  У 2021 так «зникли» 40 рахунків.
- **Форматер вибирається за рядком, а не за іменем:** `format['format' + col.type]`
  (`lib/export/accounting.js:30`), типи беруться з `config/export-columns.json`.
  Тому:
  - `grep formatDate` / «Find references» цього споживача **не покажуть**;
  - зміна виходу `formatDate` / `formatDecimal` / `formatText` змінює CSV;
  - перейменування функції в `lib/format.js` ламає експорт у runtime
    (`unknown column type`). Бухгалтерія редагує `export-columns.json` сама, без деплою.
- Вимога `MM/DD/YYYY` відома **лише з документа 2021 року**, з репо її не
  перевірити. Будь-яку зміну дат і сум у CSV погоджувати з бухгалтерією
  (Марина, вн. 214, мінімум за тиждень).

## Форматери: для людей і для машин

| Для людей | Для машин (CSV) |
|---|---|
| `formatDateUa` → `09.03.2026` (BILL-482) | `formatDate` → `03/09/2026` — **не міняти** |
| `formatMoney` → `1 234,50 грн` | `formatDecimal` → `1234.50` |

- Новий текст для клієнта (рахунок, лист, сторінка) пиши з `formatDateUa`.
  Назва `formatDate` оманлива: це формат «Облік-Плюс», а не «для відображення».
- Обидві дати рахуються за UTC (`getUTC*`). Якщо передати `Date`, створений у
  локальному часі Києва, вийде **попередній день**. Передавай ISO-рядки
  `YYYY-MM-DD`, як вони лежать у `data/`.
- Звіти (`lib/reports/*`) мають **власні** `dates.js` і `fmtAmount`, а
  `format.js` не використовують.

## Тести, що стережуть цю межу

- `test/characterization/bill-482.test.js` + `golden/`: HTML рахунку (HTTP і CLI),
  листи-нагадування, CSV байт у байт і **контрактний** тест `MM/DD/YYYY` для CSV.
- Еталони перегенеровуються командою
  `UPDATE_GOLDEN=1 node --test test/characterization/bill-482.test.js`, і **лише** для
  виходів, які читають люди. Після цього обов'язково `git diff` по `golden/`:
  `oblik-export.csv` у дифі бути не повинен.
- `golden/.gitattributes` (`* -text`) тримає CRLF у CSV. Не видаляй його.
- Шукаючи в тестах літерали дат, враховуй екранування: у регулярках слеш записано як `03\/09\/2026`.

## Застаріле — не вір без перевірки

- `docs/ARCHITECTURE.md` (2019) **хибний майже повністю**. Насправді немає ні
  Express, ні Handlebars, ні MongoDB, ні `templates/`, ні `lib/mail`, ні
  `lib/export/csv.js`. Порт 8080, Node ≥ 22. Форматування не «лише в шаблонах»,
  інтеграцій більше, ніж «тільки SMTP».
- JSDoc і коментарі теж брешуть: `router.js:92-93` («Anything without it is
  rejected») насправді стосується лише `/api/*`, тож `/invoices/:number` публічний.
  У `audit/routes.js:3` написано, що модулі пишуть через `audit.record()`, але
  його ніхто не викликає.
- Розклади cron (02:30, 09:00, 07:00, 03:10) відомі **лише з коментарів**.
  `ops/crontab` у репо немає, cron імпорту виписки вимкнено ще у 2022. Перш ніж
  покладатися на час запуску, підтверди його в експлуатації. Зокрема, у `bin/*`
  змінна `today` береться за UTC (`nightly-export.js:12`).

## Мертве (не «виправляй», не підключай без задачі)

`lib/discounts/` (прапор `loyaltyDiscounts: false`, ніхто не підключає),
`lib/legacy/*` (pdf-render і Mongo вимкнено у 2020), `lib/customers/merge.js`
(лише тести), прапор `newAgingBuckets` (ніде не читається),
`bin/fix-2022-duplicate-customers.js` (**не запускати**).

## Інші пастки

- `server.js:25-27` мовчки ковтає `MODULE_NOT_FOUND`: перейменуєш `routes.js`, і
  маршрути зникнуть без помилки.
- У CSV потрапляють і скасовані рахунки, фільтруються лише `draft` (`accounting.js:52`).
- `npm run export` / `npm run reminders` пишуть в `app/out/`. Його **не комітити**.
  `data/*.json` — спільні фікстури тестів, **не редагувати**.
- Стиль: CommonJS, `var`, колбеки, жодних npm-залежностей. Не переписуй на ESM чи async/await.
