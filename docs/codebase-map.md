# Карта кодової бази — `app/`

> Task A. Згенеруйте карту агентом, потім **перевірте її** — друга частина
> важливіша за першу.

## 1. Як агент будував карту

- Інструмент / модель: Claude Code (розширення VS Code), модель Claude Opus 5.5 (`claude-opus-5-5`)
- Промпт (стисло): «Ознайомся з усіма пунктами Task A, але виконай тільки пункт 1
  і максимально слідуй умовам виконання завдання». Пункт 1: карта `app/` —
  точки входу (HTTP, cron, CLI), модулі і що вони роблять, як зберігаються дані,
  зовнішні інтеграції, де форматуються дати й гроші.
- Вартість навігації (обидва ходи: попереднє «ознайомся з проєктом» і
  побудова карти, бо карта спирається на обидва):

  | | Ознайомлення | Карта (п. 1) | Разом |
  |---|---|---|---|
  | Викликів інструментів | 4 | 14 на навігацію + 4 на запис файлу й `git` | 22 (18 навігаційних) |
  | Токени | ≈ 53 тис. (оцінка) | ≈ 115 тис. (оцінка) | **178,9 тис.** (лічильник Claude Code) |

  Прочитано:
  - **45 з 45** файлів коду (`server.js`, `lib/`, `bin/`), повністю:
    5 275 рядків, ≈ 183 КБ;
  - 13 файлів документації й конфігів (≈ 28 КБ): кореневі `AGENTS.md` і
    `README.md`, тікет, `walkthrough.md`, `app/README.md`,
    `app/docs/ARCHITECTURE.md`, `app/docs/integrations/oblik-plus.md`,
    `package.json`, 3 файли `config/*.json`, шаблон `codebase-map.md`
    і перші 30 рядків шаблону `impact.md`;
  - `app/data/*.json` (7 файлів, ≈ 57 КБ) цілком **не** читались: я переглянув
    їх скриптом `node -e` (кількість рядків, набір полів, перший запис, формат
    дат), у контекст потрапило кілька рядків;
  - тести: **0 з 26** (лише `npm test`: 106/106 зелених).

  Разом — значення з лічильника Claude Code. Розбивку по ходах агент оцінив
  сам, за тим, наскільки зменшився бюджет токенів між ходами; лічильник
  показує лише загальну суму, і вона на ≈ 9 тис. більша за суму оцінок.
- Він прочитав усе підряд чи шукав? **Здебільшого читав усе підряд.** Код
  невеликий (≈ 5,3 тис. рядків), тому агент прочитав увесь `lib/` і `bin/`
  пакетами по модулях: точки входу → маршрути → доменні модулі → звіти, аудит,
  legacy. Пошук (`grep`) він використав у чотирьох місцях:
  1. споживачі форматера. Шаблон шукав і `formatDate`, і `require('…/format')`;
     `lib/export/accounting.js` знайшовся **лише за `require`**, бо
     `formatDate` там викликається динамічно (`format['format' + col.type]`);
  2. граф `require` у робочому коді: щоб відрізнити живі модулі від мертвих;
  3. хто викликає `audit.record()`: з'ясувалося, що ніхто;
  4. хто читає прапорці `config/features.json`.

  Тести він не відкривав. Тому все, що в карті позначено як «викликають лише
  тести», встановлено за `grep`, а не за читанням тестів.

## 2. Карта (те, що видав агент, з вашими правками)

> Карту складено з коду, не з `app/docs/`. `app/docs/ARCHITECTURE.md` (2019) з
> кодом не збігається: у ньому Express, Handlebars, MongoDB, порт 3000,
> `lib/export/csv.js`, `lib/mail`. Нічого з цього в коді немає.
> Позначка **(коментар)** означає, що твердження взято з коментаря в коді, а
> не з виконуваної логіки. Наприклад, розклад cron: самого `ops/crontab` у
> репозиторії немає.
>
> Карту складено в Task A (до BILL-482). Після зміни в Task C (`a0e14b7`)
> оновлено форматери дат: `lib/format.js` у таблиці модулів і таблицю
> «Де форматуються дати й гроші». Перевірку в розділі 3 лишено як є, з
> приміткою там, де стан коду змінився.

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP, `npm start` | Сервер на `node:http` + власний роутер, порт `config.server.port` = 8080 (або `$PORT`). Кожен модуль реєструє масив `{method, path, handler}`; відсутній модуль тихо пропускається (`MODULE_NOT_FOUND`) | `server.js`, `lib/http/router.js` |
| HTTP: автентифікація | Маршрути, що починаються з `/api/`, вимагають заголовок `x-staff-id`, який `Number()` перетворює на ненульове число (інакше 401; `-5`, `1.5` теж проходять). Походження заголовка код не перевіряє; те, що його ставить reverse proxy після LDAP, відомо лише з коментаря `lib/http/router.js:92-93` **(коментар)**. `/invoices/:number` і `/health` — без перевірки | `lib/http/router.js:100-101` |
| HTTP: рахунки | `GET /api/invoices`, `GET /api/invoices/:id`, `POST /api/orders/:id/invoice` (виставити рахунок із підтвердженого замовлення), `GET /invoices/:number` (HTML-рахунок) | `lib/invoices/routes.js` |
| HTTP: клієнти | `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`, `GET /api/customers/:id/invoices`; DELETE немає навмисно | `lib/customers/routes.js` |
| HTTP: каталог | `GET /api/products`, `GET /api/products/:id` (id або SKU), `POST /api/products/price-import`, `GET /api/stock/low` | `lib/catalog/routes.js` |
| HTTP: замовлення | `GET/POST /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/status` | `lib/orders/routes.js` |
| HTTP: оплати | `GET /api/payments`, `POST /api/payments/import` (банківська виписка KB-2), `GET /api/payments/unmatched` | `lib/payments/routes.js` |
| HTTP: звіти | `GET /api/reports/{revenue,aging,top-customers,vat}`, JSON або `?format=text` | `lib/reports/routes.js` |
| HTTP: аудит | `GET /api/audit?entity=…` (лише читання) | `lib/audit/routes.js` |
| HTTP: health | `GET /health` → `{ok:true}` | `server.js:29` |
| | **Разом 26 маршрутів** (25 модульних + `/health`) | |
| cron 02:30 щоночі **(коментар)** | `npm run export` → `out/export/oblik-YYYY-MM-DD.csv` для «Облік-Плюс» | `bin/nightly-export.js` |
| cron 09:00 робочі дні **(коментар)** | `npm run reminders` → листи-нагадування у `out/mail/*.txt`, їх забирає SMTP-relay | `bin/send-reminders.js` |
| cron 07:00 1-го числа **(коментар)** | Місячний звіт у stdout; cron пересилає його поштою директору й бухгалтерії | `bin/monthly-report.js` |
| cron 03:10 щодня **(коментар)** | Ротація аудит-логу: `node lib/audit/retention.js 365`. Точка входу лежить у `lib/`, не в `bin/` | `lib/audit/retention.js:110` |
| CLI, вручну | Імпорт банківської виписки (dry run за замовчуванням, `--apply`). Раніше був у cron о 07:00, тепер запускається вручну **(коментар)** | `bin/import-statement.js` |
| CLI | HTML рахунку в stdout | `bin/render-invoice.js` |
| CLI, одноразовий | Злиття дублікатів клієнтів 2022 (BILL-317). **Уже застосований, повторно НЕ запускати** **(коментар `:4-5`)** | `bin/fix-2022-duplicate-customers.js` |
| CLI, одноразовий | Міграція MongoDB → `data/*.json` (2020 **(коментар `:3`)**), лишився для довідки | `lib/legacy/mongo-migrate.js` |

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/store.js` | JSON-«БД»: колекція = `data/<name>.json`, ліниве завантаження, кеш у пам'яті. `insert`/`update` міняють лише кеш, на диск пише тільки `save()`. Файл, якого немає, читається як `[]` | Живий, використовують усі |
| `lib/http/router.js` | Роутер, `:param`, JSON/HTML-відповіді, `x-staff-id`, `httpError` | Живий |
| `lib/format.js` | Спільні форматери: `formatDate` (`MM/DD/YYYY`, для CSV «Облік-Плюс»), `formatDateUa` (`ДД.ММ.РРРР`, для людей; додано в BILL-482), `formatMoney`, `formatDecimal`, `formatText`, `formatPercent` | Живий. Споживачі: рахунок і нагадування (`formatDateUa`, `formatMoney`), експорт (`formatDate`, `formatDecimal`, `formatText`) |
| `lib/invoices/` | Виставлення рахунку із замовлення: ПДВ 20 % на суму без ПДВ, округлення до копійки, строк оплати 14 днів, номер `INV-YYYY-NNNNN`, `isOverdue`. `render.js` — HTML-рахунок (рядкова конкатенація) | Живий |
| `lib/customers/` | CRUD клієнтів, (де)активація (відмова, якщо є відкриті рахунки, без `force`), валідація ЄДРПОУ з контрольною цифрою (старі записи не перевіряються повторно), пошук за назвою/контактом, рахунки клієнта з оплатами | Живий. **`merge.js` (`planMerge`)** викликають лише тести; `bin/merge-customers.js` з TODO так і не з'явився |
| `lib/orders/` | Створення замовлень (`ORD-YYYY-NNNN`, для старих замовлень номер виводиться з id), рядки зі знімком ціни, машина статусів `new→confirmed→invoiced→shipped→closed` / `cancelled`; `invoiced` ставить лише модуль рахунків | Живий |
| `lib/payments/` | Парсер виписки KB-2 (fixed-width), зіставлення з рахунками (номер у призначенні платежу → точна сума → черга «unmatched»), переплата стає кредитом клієнта; двофазно: `prepareImport` → `apply` | Живий |
| `lib/catalog/` | Товари, прайс-листи (`base`/`wholesale` −7 %/`dealer` −12 % з округленням донизу до 10 коп.), картка товару, імпорт цін з файлу закупівель (`sku;ціна_грн`), звіт про низькі залишки | Живий |
| `lib/reports/` | Виручка по місяцях, дебіторка (вік рахується від `issued_at`), топ клієнтів, ПДВ; текстові таблиці й JSON; власні дати (UTC, лише ISO) | Живий: HTTP + `bin/monthly-report.js` |
| `lib/audit/` | Аудит-лог JSONL `out/audit.log`, архів `out/audit-archive/YYYY-MM.jsonl`, ротація, запити | Читання й ротація живі, **запис мертвий**: `audit.record()` ніхто в `lib/`, `bin/` і `server.js` не викликає, хоча коментар у `routes.js` каже, що модулі пишуть самі |
| `lib/export/accounting.js` | Нічний CSV для «Облік-Плюс». Колонки задає `config/export-columns.json`; форматер обирається **динамічно**: `format['format' + col.type]` (`Text`/`Date`/`Decimal`) | Живий (cron) |
| `lib/notifications/reminders.js` | Листи-нагадування: за `config.reminders.daysBeforeDue` = 3 дні до строку, а також після прострочення. ~~«один раз після прострочення»~~ **Правка після перевірки (№ 11):** прапорці `overdue_reminded`/`upcoming_reminded` лише читаються, ніхто їх не записує, тож кожен запуск `bin/send-reminders.js` знову створює й ставить у чергу (`out/mail/*.txt`) ті самі нагадування про прострочення; чи відправляє їх SMTP-relay, у репо не видно. Частота запуску в репо не підтверджена: за коментарем `bin/send-reminders.js:3` — 09:00 у робочі дні **(коментар)** | Живий (cron **(коментар)**) |
| `lib/discounts/` | Знижки постійного клієнта (рівні standard/legacy) | **Мертвий**: ніхто не імпортує, «відключений у 2023» **(коментар)**. Прапорець `features.loyaltyDiscounts` читає лише цей модуль |
| `lib/legacy/templates.js` | Власний міні-Handlebars, хелпери `money`, `date` | **Мертвий**: теки `app/templates/` немає, використовує лише `pdf-client.js` і тести |
| `lib/legacy/pdf-client.js` | Клієнт сервісу `pdf-render` | **Мертвий**: сервіс вимкнено у 2020 **(коментар)**, ніхто не імпортує |
| `lib/legacy/mongo-migrate.js` | Одноразова міграція з Mongo | Мертвий (для довідки) |
| `config/features.json` → `newAgingBuckets` | — | **Не використовується** ніде в коді |

### Дані

- **Сховище:** JSON-файли в `app/data/` через `lib/store.js`. MongoDB немає з
  2020 року (є лише `lib/legacy/mongo-migrate.js`). Колекції з файлами:
  `customers` (12), `products` (20), `orders` (36), `invoices` (36),
  `payments` (6), `price_history` (38), `stock` (20). Колекції
  `payments_unmatched` і `customer_credits` файлів не мають: store віддає `[]`,
  а файл з'являється при першому `apply` імпорту оплат.
- **Рядки не видаляються:** клієнта деактивують (`active:false`) або зливають
  (`merged_into`).
- **Згенероване:** `app/out/` (export, mail, audit.log) — у `.gitignore`.
- **Дати** зберігаються рядками `YYYY-MM-DD`: усі `*_at` у фікстурах мають
  саме цей формат. Винятки створює код: `status_changed_at` і
  `status_history[].at` у замовленнях (`lib/orders/status.js:90`) та `ts` в
  аудиті мають повний ISO з часом. «Сьогодні» майже скрізь
  рахується в UTC, але `lib/catalog/price-import.js:31-34` бере **локальну** дату
  сервера. Своїх копій `toIsoDate` у коді щонайменше шість: orders, customers,
  audit, discounts, reports/dates, price-import, плюс `mongo-migrate` з
  Europe/Kiev.
- **Гроші** — цілі копійки (`*_kopecks`) скрізь. Ціни в прайс-файлі закупівель
  приходять у гривнях (`95,50` або `95.50`) і конвертуються в `parseHrn`.
- **Вхідні формати:** виписка KB-2, дати `DDMMYYYY` → ISO
  (`lib/payments/statement.js`); прайс-файл `sku;ціна`.

### Де форматуються дати й гроші

| Що | Де | Формат | Хто бачить |
|---|---|---|---|
| `formatDate` | `lib/format.js:31-36` | **`MM/DD/YYYY`** (JSDoc до BILL-482 казав «ISO», виправлено в `a0e14b7`, `lib/format.js:29`) | Лише **CSV «Облік-Плюс»** (колонки `DocDate`, `PayUntil` через `type: "Date"`, `lib/export/accounting.js:29-35`). Цей виклик не знайти пошуком за ім'ям `formatDate`. До BILL-482 також рахунок і нагадування |
| `formatDateUa` | `lib/format.js:41-46` | **`ДД.ММ.РРРР`** | Рахунок HTML (`lib/invoices/render.js:38-39`), нагадування (`lib/notifications/reminders.js:40,46`). Додано в BILL-482 (`a0e14b7`) |
| `formatMoney` | `lib/format.js` | `1 234,50 грн` | Рахунок, нагадування |
| `formatDecimal` | `lib/format.js` | `1234.50` | CSV «Облік-Плюс» (`type: "Decimal"`) |
| `formatText` | `lib/format.js` | прибирає `;`, переноси рядків | CSV «Облік-Плюс» (`type: "Text"`) |
| `formatPercent` | `lib/format.js` | `20%` | Рахунок (ставка ПДВ) |
| `fmtAmount` (локальна) | `lib/reports/table.js` | `12 345,67` (без «грн») | Текстові звіти |
| `monthName` | `lib/reports/dates.js` | `березень 2026` | Звіти. Дати в текстовій дебіторці виводяться як сирі ISO (`issued_at`, `due_at`, `as_of`), без форматування |
| `fmtAmount` (локальна) | `lib/customers/index.js:32` | `5793.00` | `totals.outstanding` у `GET /api/customers/:id/invoices` для старого адмін-UI **(коментар)** |
| `fmtAmount` (локальна) | `lib/catalog/price-import.js:37` | `95,50` | Звіт імпорту цін (summary, причини пропуску) |
| `fmtAmount` (локальна) | `bin/import-statement.js:16` | `1234.50` | Консоль |
| `dmy`, `fmtAmount` | `lib/legacy/templates.js` | `дд.мм.рррр`, `1 234,50` | Нікому (мертвий код) |
| `fmtAmount` | `lib/discounts/index.js:132` | `14 379,00 грн` | Нікому (мертвий код) |

### Зовнішні інтеграції

| Система | Напрям | Формат / контракт | Звідки відомо |
|---|---|---|---|
| **«Облік-Плюс»** (бухгалтерія) | Вихід: `out/export/oblik-YYYY-MM-DD.csv`; що їхній сервер забирає його о 06:00 — **(документ, коментар `bin/nightly-export.js:4`)** | З коду: UTF-8, `;`, CRLF, перший рядок — заголовки, дата `MM/DD/YYYY`, суми `1234.50`, текст без `;`, чернетки не експортуються. Лише з документа **(документ, див. № 9 ⚠️)**: що «Облік-Плюс» вимагає саме `MM/DD/YYYY` (американська локаль) і **мовчки пропускає** рядок з іншою датою (інцидент лютого 2021) | `lib/export/accounting.js`, `config/export-columns.json`, `app/docs/integrations/oblik-plus.md` |
| SMTP-relay **(коментар)** | Вихід: файли `out/mail/<дата>-<kind>-<invoice_id>.txt` (`To:`, `Subject:`, текст) — черга | Адресат — email клієнта з `customers.json`. Що relay забирає й відправляє файли, відомо лише з коментаря; коду relay у репо немає | `bin/send-reminders.js:20-27`; relay — лише коментар `:3-4` |
| Пошта директору й бухгалтерії | Вихід: stdout `bin/monthly-report.js` через cron **(коментар)** | Текстова таблиця; бухгалтерія вставляє її в Excel: два пробіли між колонками, без табуляцій | `lib/reports/table.js:5-6` |
| BI-таблиця (Олена, щопонеділка) **(коментар)** | Вихід: JSON звітів | JSON, суми в копійках, дати ISO | `lib/reports/render.js:2-3` |
| Старий адмін-UI / екрани замовлень **(коментар)** | Вихід: JSON API | Напр. `outstanding` як `"5793.00"`, `next_statuses` (формат — з коду) | Хто читає — лише коментарі `lib/customers/index.js:31`, `lib/orders/index.js:80-81`; коду UI в репо немає |
| Банк («Банк Вигаданий», KB-2) | Вхід: виписка (CLI або `POST /api/payments/import`) | Fixed-width, дати `DDMMYYYY`, суми в копійках, дедуплікація за `bank_ref` | `lib/payments/statement.js` |
| Відділ закупівель | Вхід: прайс-файл | `sku;ціна_грн[;примітка]`, кома або крапка | `lib/catalog/price-import.js` |
| Reverse proxy + LDAP **(коментар)** | Вхід: заголовок `x-staff-id` | Будь-яке значення, ненульове після `Number()`; походження не перевіряється | Лише коментар `lib/http/router.js:92-93`; у репо не підтверджено. Перевірка значення — `:100-101` |
| `pdf-render`, MongoDB | — | Вимкнені у 2020, лишився мертвий код у `lib/legacy/` | коментарі в `lib/legacy/*` |

## 3. Перевірка — щонайменше 10 тверджень

Найперше перевірялось те, що збігається зі старою документацією
(`app/docs/ARCHITECTURE.md`, `app/README.md`, `oblik-plus.md`) або взято з
коментарів у коді. Команди запускались з `app/`. Сервер піднімався лише на
тимчасовому порту й лише на читання; жоден файл у `data/` чи `out/` не
змінювався.

| # | Твердження з карти | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | Дані — JSON-файли в `data/`, не MongoDB (ARCHITECTURE.md каже MongoDB) | ✅ | `lib/store.js:14,24-25` (`data/<name>.json`). `grep -rliE "mongo" server.js lib bin` → лише мертві `lib/legacy/mongo-migrate.js` і `lib/legacy/pdf-client.js` (у другому — коментар «next to Mongo») |
| 2 | Немає Express і Handlebars, npm-залежностей немає (ARCHITECTURE.md: «Express-застосунок із шаблонами Handlebars») | ✅ | `package.json` без `dependencies`; `grep -rniE "express\|handlebars"` → лише коментар у `lib/http/router.js:4` («We had Express until 2020») і `lib/legacy/*` |
| 3 | Порт 8080, не 3000 (ARCHITECTURE.md: 3000) | ✅ | `config/default.json:7` → `"port": 8080`; `server.js:38` |
| 4 | 26 HTTP-маршрутів (25 модульних + `/health`) | ✅ | `node -e` зі сумою довжин `require("./lib/<m>/routes")` → `25 + /health = 26` |
| 5 | `/api/*` вимагає `x-staff-id`, `/invoices/:number` і `/health` — ні | ✅ | `lib/http/router.js:101`. На живому сервері (`createServer().listen(0)`): `/api/invoices` без заголовка → 401, із `x-staff-id: 7` → 200; `/invoices/INV-2026-00007` → 200; `/health` → 200 |
| 6 | `formatDate` видає `MM/DD/YYYY`, хоча JSDoc каже «ISO» (ARCHITECTURE.md: «дати передаються в ISO 8601») | ✅ | `lib/format.js:27,33`. `node -e 'console.log(require("./lib/format").formatDate("2026-03-09"))'` → `03/09/2026`. _Стан на час Task A (до BILL-482). Після `a0e14b7` JSDoc каже `MM/DD/YYYY` (`lib/format.js:29`), функція — `:31-36`; вихід той самий._ |
| 7 | CSV «Облік-Плюс» отримує дату з `formatDate` через динамічний виклик, а пошук за іменем цього не показує | ✅ | `lib/export/accounting.js:30` (`format['format' + col.type]`), `config/export-columns.json:3-4` (`"type": "Date"`). Прогін `buildAccountingFile` на фікстурах → `INV-2026-00001;03/01/2026;03/15/2026;…;5793.00\r`. `grep -n formatDate lib/export/accounting.js` → нічого |
| 8 | Формат CSV: `;`, CRLF, суми `1234.50`, без чернеток (ARCHITECTURE.md: «Бухгалтерія забирає CSV вручну», «тільки SMTP») | ✅ | `lib/export/accounting.js:12-13` (SEP, EOL), `:52` (фільтр `draft`); вихід прогону в № 7. У фікстурах чернеток 0, тож фільтр на них не перевірено |
| 9 | Дату `MM/DD/YYYY` вимагає сам «Облік-Плюс»; рядок з іншою датою він мовчки пропускає | ⚠️ не перевіряється в репо | Єдине джерело — `app/docs/integrations/oblik-plus.md:23,29-31`; у коді цей контракт ніде не записаний (`grep -rn "MM/DD" lib bin config` → нічого). Код із документом узгоджений (№ 7), але саме твердження про зовнішню систему не перевірене. У № 1-3 документація виявилась застарілою, тож перед Task C це треба підтвердити в бухгалтерії |
| 10 | Запис в аудит мертвий: `audit.record()` ніхто не викликає (коментар `lib/audit/routes.js:2-3` каже, що модулі пишуть самі) | ✅ | `grep -rn "\.record(" server.js lib bin \| grep -v "^lib/audit/"` → нічого |
| 11 | Нагадування про прострочення надсилається «один раз» | ❌ | Прапорці лише читаються: `lib/notifications/reminders.js:20,22`; `grep -rn "_reminded" lib bin` → тільки ці два рядки; `bin/send-reminders.js:23-26` лише пише файли. `buildReminders` на фікстурах 2026-09-28 і 2026-09-29 → ті самі 27 прострочених листів обидва дні. Твердження я взяв із коментаря `reminders.js:2` («once when overdue»). **Карту виправлено** |
| 12 | `lib/discounts/`, `lib/legacy/templates.js`, `lib/legacy/pdf-client.js`, `customers/merge.js` — мертві | ✅ | `grep -rln "discounts" server.js lib bin` → лише сам модуль; `templates` → лише `pdf-client.js` і тест; `pdf-client` → нікому; `merge` → лише `test/customers/search-merge.test.js:4`. `ls templates` → «No such file or directory» |
| 13 | `features.newAgingBuckets` ніде не використовується, `loyaltyDiscounts` читає лише мертвий `discounts` | ✅ | `grep -rn "newAgingBuckets\|loyaltyDiscounts" lib bin server.js test` → лише `lib/discounts/index.js:5,34` і тести discounts |
| 14 | Усі `*_at` у фікстурах мають формат `YYYY-MM-DD`; `toIsoDate` має ≥ 6 копій, `price-import` бере локальну дату | ✅ | `node -e` по фікстурах → «all *_at are YYYY-MM-DD». `grep -rn "function toIsoDate"` → audit, price-import, customers, discounts, orders, reports/dates (+ mongo-migrate і statement з іншою семантикою); `lib/catalog/price-import.js:33` — `getFullYear/getMonth/getDate` без UTC |
| 15 | Дати в текстовій дебіторці виводяться сирим ISO; `outstanding` для адмін-UI — рядок `"1234.50"` | ✅ | `renderText(aging(…, "2026-03-31"))` → «станом на 2026-03-31», рядок `INV-2026-00031 … 2026-02-07  2026-02-21 …` (`lib/reports/render.js:40,45-46`). `customers.invoicesFor(1)` → `outstanding: "8586.00"` (`lib/customers/index.js:32-37,221`) |
| 16 | Колекцію без файлу store читає як `[]`; `payments_unmatched` і `customer_credits` файлів не мають | ✅ | `lib/store.js:32-34`; `ls data/payments_unmatched.json data/customer_credits.json` → «No such file or directory» |
| 17 | ПДВ 20 %, строк оплати 14 днів | ✅ | `lib/invoices/index.js:6-7` |
| 18 | Розклади cron (02:30, 09:00, 07:00 1-го, 03:10) | ⚠️ не перевіряється в репо | `git ls-files \| grep -i cron` → нічого; розклади є лише в коментарях: `bin/nightly-export.js:3`, `bin/send-reminders.js:3`, `bin/monthly-report.js:9`, `lib/audit/retention.js:5` |

Разом: 15 ✅, 1 ❌ (№ 11, виправлено в карті), 2 ⚠️ (№ 9, 18 — у репозиторії
немає даних, щоб їх перевірити).

## 4. Висновок

**Де агент помилився.** У фінальному тексті карти — в одному місці (№ 11);
ще 3 дрібніші помилки агент виправив сам до коміту (див.
`docs/ai-on-legacy.md`, випадки 2-4). Опис нагадувань («один раз
після прострочення») агент узяв із коментаря в заголовку
`lib/notifications/reminders.js` і не перевірив, чи хтось записує прапорці
`overdue_reminded`/`upcoming_reminded`. Код лише читає їх, тож кожен запуск
`send-reminders` знову створює й ставить у чергу (`out/mail/*.txt`) ті самі
нагадування про прострочення; чи відправляє їх SMTP-relay, у репо не видно. Причина та
сама, що зі старою документацією: коментар — теж твердження про код, а не код.
Твердження з `ARCHITECTURE.md` агент обійшов, бо свідомо будував карту з коду,
але коментарям довіряв більше, ніж слід.

**Чому перевірено найризикованіше.**
- № 1-3, 6, 8 прямо суперечать `app/docs/ARCHITECTURE.md` (MongoDB, Express,
  порт 3000, «дати в ISO», «тільки SMTP»). Якби агент узяв хоч одне з них із
  документації, помилку показала б саме ця перевірка.
- № 7, 9 — контракт, від якого залежить Task B/C: дата в CSV для
  «Облік-Плюс». Шлях у коді доведено прогоном. Сам контракт (яку дату приймає
  зовнішня система) у репозиторії не перевіряється, тож його чесно позначено ⚠️.
- № 10-13 — твердження «мертве / ніхто не викликає». Вони найлегше хибні:
  коментарі кажуть протилежне. Тому кожне перевірено `grep`-ом по всьому
  робочому коду, а не читанням одного файлу.
- № 18 і решта позначок **(коментар)** у карті взято з коментарів. Для cron
  доказу в репозиторії немає, це зафіксовано.

Твердження, які агент узяв із `oblik-plus.md` і з коментарів, залишаються
найслабшим місцем карти. Перед Task C варто підтвердити формат дати в
бухгалтерії (Марина, вн. 214, за `oblik-plus.md`).
