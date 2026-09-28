# AGENTS.md — prykladpostach-billing

Прочитай **до** того, як щось міняти. Тут лише те, чого не видно з коду
напряму або що код і коментарі кажуть неправильно. Усе перевірено по коду
(докази: `../docs/codebase-map.md`, `../docs/impact.md`).

Швидко: plain Node 22, CommonJS, колбеки, **жодних npm-залежностей**.
`npm test` (вбудований `node --test`). Не переписуй на ESM/async, не
«прибирай» чужий код — у цьому репо малий диф важливіший за красу.

## Контракти з іншими системами — не ламати

**«Облік-Плюс» (бухгалтерія), найризикованіше місце.**
`bin/nightly-export.js` → `lib/export/accounting.js` → `out/export/oblik-YYYY-MM-DD.csv`,
файл забирає їхній сервер о 06:00.

- Функцію форматування клітинки обирає **рядок з конфігу**:
  `format['format' + col.type]` (`lib/export/accounting.js:30`), типи — у
  `config/export-columns.json`. Тож `"Date"` = `formatDate`,
  `"Decimal"` = `formatDecimal`, `"Text"` = `formatText`. **Пошук за іменем
  функції цього споживача не знаходить.**
- `formatDate` (`lib/format.js:31`) має лишатися `MM/DD/YYYY`. Рядок з іншою
  датою «Облік-Плюс» **мовчки пропускає**, без помилки ні в нас, ні в них: так
  у 2021 році «зникли» 40 рахунків (`docs/integrations/oblik-plus.md`).
- Не перейменовуй і не прибирай `formatDate` / `formatDecimal` / `formatText`
  з `module.exports`: експорт упаде з `unknown column type`. Будь-яка нова
  функція `formatXxx` автоматично стає допустимим типом колонки.
- `pad()` (`lib/format.js:13`) спільна для дат і грошей: зміна зачепить суми
  в тому самому CSV.
- Типи колонок у `export-columns.json` не міняй: цей файл править бухгалтерія
  без деплою.
- Контракт відомий **лише** з `docs/integrations/oblik-plus.md`, коду
  «Облік-Плюс» у репо немає. Зміну формату погоджуй із бухгалтерією
  (Марина, вн. 214) щонайменше за тиждень.

**Дати для людей** — `formatDateUa` (`ДД.ММ.РРРР`, `lib/format.js:41`): рахунок
(`lib/invoices/render.js:38-39`) і листи-нагадування
(`lib/notifications/reminders.js:40,46`). Для клієнтських документів
`formatDate` не використовуй.

**Інші виходи, які читають машини або Excel** (перевірено: від `format.js` не
залежать):
- JSON `/api/*` — старий адмін-UI; напр. `totals.outstanding` у
  `GET /api/customers/:id/invoices` — рядок `"5793.00"`
  (`lib/customers/index.js:32,221`), не число.
- Звіти JSON — BI-таблиця (`lib/reports/render.js:2-3`, коментар); текст
  місячного звіту вставляють у Excel: два пробіли між колонками, без табуляцій
  (`lib/reports/table.js:5-6`).
- Листи: `bin/send-reminders.js` лише пише `out/mail/*.txt` (черга). Що їх
  забирає й відправляє старий SMTP-relay, відомо лише з коментаря `:3-4`;
  коду relay у репо немає.

Перш ніж міняти форматування, запусти
`test/characterization/date-consumers.test.js`: він фіксує рахунок, листи й
CSV «Облік-Плюс» байт у байт.

## Застаріла документація і коментарі, яким не можна вірити

- `docs/ARCHITECTURE.md` (2019) неправильний майже весь: немає Express,
  Handlebars, MongoDB, `lib/export/csv.js`, `lib/mail`; порт 8080, а не 3000;
  дати «в ISO» не передаються; інтеграцій більше, ніж «тільки SMTP».
- `lib/format.js` мав JSDoc «the date in ISO format» — насправді `MM/DD/YYYY`
  (виправлено в BILL-482).
- «Overdue reminder **once**» (`lib/notifications/reminders.js:2`, назва тесту
  в `test/reminders.test.js:13`) — неправда: `overdue_reminded` /
  `upcoming_reminded` лише читаються, **ніхто їх не записує**, тож кожен запуск
  `bin/send-reminders.js` знову створює й ставить у чергу (`out/mail/*.txt`)
  ті самі нагадування про прострочення. Чи відправляє їх SMTP-relay і як часто
  запускають скрипт, у репо не видно — лише коментар `:3-4`.
- «Entries are written by the modules themselves» (`lib/audit/routes.js:2-3`) —
  `audit.record()` не викликає ніхто; аудит-лог порожній.
- Мертвий код: `lib/discounts/*` (і прапорець `loyaltyDiscounts`),
  `lib/legacy/templates.js`, `lib/legacy/pdf-client.js` (теки `templates/`
  немає), `lib/customers/merge.js`; `features.newAgingBuckets` не читає ніхто.
- Розклади cron є лише в коментарях `bin/*.js` і `lib/audit/retention.js:5`;
  `ops/crontab` у репо немає.

## Пастки

- `lib/store.js`: `insert` / `update` міняють лише кеш у пам'яті, на диск пише
  тільки `save()` (`:113`). Колекції без файлу читаються як `[]` (`:32`), напр.
  `payments_unmatched`, `customer_credits`.
- **Не змінюй `data/*.json`**: це спільні фікстури тестів. Тест, який пише,
  має працювати на копії (зразок — `useSeedCopy` у
  `test/customers/routes.test.js`).
- `bin/*` пишуть у фіксовану `out/` (не комітити); `bin/fix-2022-duplicate-customers.js`
  — одноразовий, **не запускати**.
- «Сьогодні» майже скрізь — UTC-дата, але `lib/catalog/price-import.js:31`
  бере **локальну** дату сервера. Копій `toIsoDate` щонайменше шість.
- `GET /invoices/:number` і `/health` працюють без `x-staff-id`; решта
  `/api/*` — лише з ним (`lib/http/router.js:101`).
- `node --test` запускає **кожен `.js` у `test/`**: еталони тримай не в `.js`.
  На Windows у цьому репо `core.autocrlf=true`, тому еталони з CRLF (CSV)
  зберігаються як JSON-рядки (`test/characterization/golden/`).
- Коментар — це твердження, а не факт: поведінку перевіряй по коду (хто
  **записує** прапорець, хто **викликає** функцію). Приклади помилок агента —
  `../docs/ai-on-legacy.md`.
