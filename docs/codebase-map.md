# Карта кодової бази — `app/`

> Task A. Карту згенерував агент, твердження перевірені за кодом і командами
> (розділ 3). Шаблон: `docs/templates/codebase-map.md`.

## 1. Як агент будував карту

- **Інструмент / модель:** Claude Code (CLI, Windows + Git Bash), модель
  Claude Fable 5.1 (`claude-fable-5-1`), одна сесія, без субагентів.
- **Промпт (дослівно, через `/goal`):**
  > Попросіть агента скласти карту app/: точки входу (HTTP, cron, CLI), модулі
  > і що вони роблять, як зберігаються дані, які є зовнішні інтеграції, де
  > форматуються дати й гроші. Запишіть у docs/codebase-map.md (шаблон —
  > docs/templates/codebase-map.md). Запишіть вартість навігації: скільки
  > файлів агент прочитав, скільки викликів інструментів і токенів це
  > коштувало (лічильник є в кожному інструменті). Він читав усе підряд чи
  > шукав?
- **Вартість навігації** (до запису цього файлу; сам `Write` — ще один виклик):

  | Метрика | Значення |
  |---|---|
  | Викликів інструментів | 73 до запису карти (Read 57, Grep 10, Glob 3, Bash 3); 74 разом із `Write` |
  | Файлів у `app/` всього | 88 |
  | Файлів `app/` відкрито | 54: 25 повністю, 21 лише заголовок (перші 20–45 рядків), 8 фікстур `data/` лише перші 8–35 рядків |
  | Файлів `app/` не відкрито | 34: усі 28 тестів і 6 файлів `lib/*/routes.js` (таблиці маршрутів зібрані через Grep) |
  | Файлів поза `app/` | 4: `AGENTS.md`, шаблон, `materials/ticket-BILL-482.md`, `.gitignore` |
  | Токенів за лічильником середовища | ≈117 тис. до запису (`total_tokens left`: 15 000 000 → 14 882 696); ≈130 тис. після запису карти |
  | Раундів (паралельних пакетів викликів) | 7 |

- **Він прочитав усе підряд чи шукав?** Шукав. Послідовність була такою:
  1. `Glob app/**` — структура без читання вмісту.
  2. Повністю прочитано тільки «хребет»: `package.json`, `server.js`,
     `lib/http/router.js`, `lib/store.js`, `lib/format.js`.
  3. `Grep require\(['"]\.` по всьому `app/` — граф залежностей за один
     виклик. Саме з нього видно живі/мертві модулі (хто кого `require`-ить).
  4. `Grep cron|setInterval|schedule` — розклад; `Grep (method|path):` по
     `routes.js` — усі HTTP-маршрути без відкриття файлів маршрутів.
  5. Повністю прочитано шість `bin/*`, обидві legacy-доки, конфіги, експорт,
     нагадування, аудит; решта модулів — лише doc-коментар у заголовку.
  6. `Grep` за патернами форматування (`toISOString|getMonth|/ 100|fmtAmount|
     formatDate…`) та вводу-виводу (`writeFile|http.request|smtp|mongo|out/`)
     — щоб знайти всі місця форматування дат/грошей і всі точки виходу назовні.
  7. Перевірка командами: `npm test`, `node -e` з реальними фікстурами,
     `grep -rl` на відсутність `require` для audit/discounts.

  Найдорожчий і водночас найкорисніший крок — граф `require` (крок 3):
  він одразу показав, що `lib/discounts` і `audit.record()` ніхто не викликає.

## 2. Карта

### Точки входу

Розклад cron є **лише в коментарях** до скриптів; самого crontab у репозиторії
немає («ops/crontab на старому сервері»). Усі `bin/*` — звичайні Node-скрипти.

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP `npm start` → `:8080` (або `PORT`) | Власний роутер без Express; 7 модулів реєструють маршрути масивом `{method, path, handler}`; `/api/*` вимагає заголовок `x-staff-id` (ставить reverse proxy після LDAP), інакше 401 | `app/server.js`, `app/lib/http/router.js` |
| `GET /health` | `{ ok: true }` | `app/server.js:29` |
| `GET /invoices/:number` | HTML-рахунок (єдиний не-JSON, без `x-staff-id`) | `app/lib/invoices/routes.js` |
| `GET/POST /api/invoices…`, `POST /api/orders/:id/invoice` | Список, картка, виставлення рахунку з замовлення | `app/lib/invoices/routes.js` |
| `GET/POST/PATCH /api/customers…`, `GET /api/customers/:id/invoices` | CRUD клієнтів, рахунки клієнта з підсумками | `app/lib/customers/routes.js` |
| `GET /api/products…`, `POST /api/products/price-import`, `GET /api/stock/low` | Каталог, масове оновлення цін із файлу закупівель, звіт про низькі залишки | `app/lib/catalog/routes.js` |
| `GET/POST /api/orders…`, `POST /api/orders/:id/status` | Замовлення та машина станів | `app/lib/orders/routes.js` |
| `GET /api/payments`, `POST /api/payments/import`, `GET /api/payments/unmatched` | Оплати, імпорт банківської виписки, черга незіставлених | `app/lib/payments/routes.js` |
| `GET /api/reports/{revenue,aging,top-customers,vat}` (`?format=text`) | Управлінські звіти, JSON або текстова таблиця | `app/lib/reports/routes.js` |
| `GET /api/audit` | Читання журналу аудиту (який ніхто не пише — див. модулі) | `app/lib/audit/routes.js` |
| cron 02:30 щоночі (`npm run export`) | Файл для бухгалтерії `out/export/oblik-YYYY-MM-DD.csv` | `app/bin/nightly-export.js` |
| cron 09:00 у робочі дні (`npm run reminders`) | Листи-нагадування → файли в `out/mail/`, звідки їх забирає SMTP-relay | `app/bin/send-reminders.js` |
| cron 07:00 1-го числа | Місячний звіт у stdout; crontab перенаправляє в пошту директору та бухгалтерії | `app/bin/monthly-report.js` |
| cron 03:10 щодня (`node lib/audit/retention.js 365`) | Ротація `out/audit.log` → `out/audit-archive/YYYY-MM.jsonl` | `app/lib/audit/retention.js:110` |
| CLI (колись cron 07:00, вимкнено 2022) | Імпорт виписки KB-2: `import-statement.js <file> [--apply] [--json] [--data-dir]`; без `--apply` — dry run | `app/bin/import-statement.js` |
| CLI | `render-invoice.js INV-2026-00007 > invoice.html` | `app/bin/render-invoice.js` |
| CLI, одноразовий (застосовано 2022-08-09, «DO NOT RUN AGAIN») | Злиття дублікатів клієнтів за жорстко закодованим списком | `app/bin/fix-2022-duplicate-customers.js` |
| CLI, одноразовий (2020-11) | Міграція MongoDB → `data/*.json` | `app/lib/legacy/mongo-migrate.js` |

### Модулі

«Живий» = є в графі `require` від `server.js`, `bin/*` або запускається напряму.
«Мертвий» = його `require`-ять тільки тести або інший мертвий модуль.

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/http/router.js` | Роутер на `http`, `:param`, парсинг JSON-тіла, `x-staff-id`, `httpError(status, msg)` | живий |
| `lib/store.js` | «База»: один JSON-файл на колекцію, лінивий кеш у пам'яті, `save()` переписує файл цілком; callback-стиль | живий |
| `lib/format.js` | **Спільні** форматувальники: `formatDate` (MM/DD/YYYY), `formatMoney` («1 234,50 грн»), `formatDecimal` («1234.50»), `formatText`, `formatPercent` | живий; споживачі: `invoices/render`, `notifications/reminders`, `export/accounting` |
| `lib/invoices/index.js` | Виставлення з замовлення, нумерація `INV-YYYY-NNNNN`, ПДВ 20 % на підсумок (округлення до копійки, «не чіпати»), `isOverdue`, термін 14 днів | живий |
| `lib/invoices/render.js` | Рахунок → HTML конкатенацією рядків (templates/ видалено 2020) | живий |
| `lib/invoices/routes.js` | HTTP; виставляє лише для `confirmed` і сам переводить замовлення в `invoiced` в обхід `orders/status.js` | живий |
| `lib/customers/index.js` | CRUD, активація/деактивація, рахунки клієнта; власний `fmtAmount` («5793.05») для старого адмін-UI; рядки ніколи не видаляються | живий |
| `lib/customers/search.js` | Пошук за фрагментом назви з нормалізацією апострофів/лапок | живий |
| `lib/customers/validate.js` | Валідація полів, контрольна цифра ЄДРПОУ, повідомлення українською | живий |
| `lib/customers/merge.js` | `planMerge()` — чистий план злиття дублікатів; «TODO(2021): bin/merge-customers.js» так і не написано | мертвий (тільки тест) |
| `lib/customers/routes.js` | HTTP | живий |
| `lib/orders/index.js` | Створення, нумерація `ORD-YYYY-NNNN`, список; власна копія `toIsoDate` | живий |
| `lib/orders/lines.js` | Валідація позицій проти каталогу, знімок ціни; `MAX_QTY = 9999` | живий |
| `lib/orders/status.js` | Машина станів `new → confirmed → invoiced → shipped → closed`, `cancelled` | живий |
| `lib/orders/routes.js` | HTTP | живий |
| `lib/catalog/index.js` | Продукти, прайс-листи (роздріб/опт 7 %/дилер 12 % з округленням вниз до 10 коп.) | живий |
| `lib/catalog/stock.js` | Залишки, звіт про низькі залишки, «застарілий» підрахунок > 45 днів | живий |
| `lib/catalog/price-import.js` | Імпорт `sku;ціна_грн[;примітка]` з Excel закупівель, захист від стрибка ×10, запис у `price_history`; **дата у локальному часі** | живий |
| `lib/catalog/routes.js` | HTTP | живий |
| `lib/payments/statement.js` | Парсер виписки KB-2 (фіксована ширина, дати `DDMMYYYY`, суми в копійках) | живий |
| `lib/payments/matcher.js` | Зіставлення переказів із рахунками: номер у призначенні → точна сума → черга незіставлених; переплата = кредит клієнта | живий |
| `lib/payments/index.js` | `prepareImport` (план, нічого не пише) + `apply` (пише `payments`, `invoices`, `customer_credits`, `payments_unmatched`) | живий (HTTP і CLI) |
| `lib/payments/routes.js` | HTTP | живий |
| `lib/reports/index.js` | Чисті функції: виручка по місяцях, aging (кошики 0–30/31–60/61–90/90+ жорстко в коді), топ клієнтів, ПДВ | живий (HTTP і cron) |
| `lib/reports/dates.js` | Свої date-helpers лише для ISO/`YYYY-MM`, тільки UTC, `monthName` → «березень 2026» | живий |
| `lib/reports/table.js` | Текстова таблиця фіксованої ширини + **свій** `fmtAmount` («12 345,67», без «грн») | живий |
| `lib/reports/render.js` | Звіт → текст (пошта, термінал) або JSON (API, BI-таблиця) | живий |
| `lib/reports/routes.js` | HTTP | живий |
| `lib/notifications/reminders.js` | Які нагадування потрібні сьогодні (за N днів до строку і раз при простроченні); текст листа через `format.formatMoney`/`formatDate` | живий (лише cron) |
| `lib/export/accounting.js` | Файл для «Облік-Плюс»: `;`, CRLF, колонки з `config/export-columns.json`, кожна клітинка через `format['format' + type]` | живий (лише cron) |
| `lib/audit/index.js` | Append-only JSONL `out/audit.log`, `record()/query()/history()`, маскування `iban/password/token` | **напівмертвий**: читання працює, але `record()` не викликає жоден модуль поза тестами — журнал у проді порожній |
| `lib/audit/retention.js` | Ротація логу в архів за місяцями; запускається напряму з cron | живий як скрипт |
| `lib/audit/routes.js` | `GET /api/audit`; коментар «entries are written by the modules themselves» — неправда | живий, читає порожній лог |
| `lib/discounts/index.js`, `tiers.js` | Знижка постійного клієнта за оборотом 12 міс.; прапорець `features.json → loyaltyDiscounts` (вимкнено) | мертвий (відключено 2023, «nothing calls this module»; тільки тести) |
| `lib/legacy/mongo-migrate.js` | Одноразова міграція Mongo → JSON (2020) | мертвий |
| `lib/legacy/pdf-client.js` | Клієнт сервісу pdf-render, вимкненого в листопаді 2020; ніхто не `require`-ить | мертвий |
| `lib/legacy/templates.js` | Власний підмножина Handlebars для `templates/*.hbs`; каталогу `templates/` не існує | мертвий (тільки pdf-client і тест) |
| `config/default.json` | Компанія, порт, `out/mail`, `out/export` + префікс `oblik-`, `daysBeforeDue: 3` | живий |
| `config/export-columns.json` | 8 колонок експорту з типами `Text/Date/Decimal` — бухгалтерія переставляє без деплою, **типи не міняти** | живий |
| `config/features.json` | `loyaltyDiscounts` читає лише мертвий `discounts`; `newAgingBuckets` не читає ніхто | фактично мертвий |

### Дані

**Де.** `app/data/*.json`, по файлу на колекцію, масив об'єктів з цілим `id`
(`nextId = max + 1`). `lib/store.js` вантажить файл ліниво, тримає в пам'яті
процесу й на `save(name)` переписує файл цілком (відступ 2, кінцевий `\n`).
Відсутній файл читається як порожня колекція. HTTP-обробники викликають
`store.save`, тож запущений сервер **пише в `data/*.json`** — ті самі
фікстури, що й тести (AGENTS.md: не редагувати). Тести відкривають тимчасові
каталоги через `store.open(dir)`.

| Колекція | Ключові поля | Хто пише |
|---|---|---|
| `customers` | `name, contact_name, edrpou, email, city, created_at, active, [merged_into, updated_at, updated_by]` | customers/routes, fix-2022 |
| `orders` | `customer_id, created_at, status, lines[{product_id, title, qty, unit_price_kopecks}]` | orders/routes, invoices/routes (статус) |
| `invoices` | `number, order_id, customer_id, issued_at, due_at, vat_rate, subtotal/vat/total_kopecks, status (draft/issued/paid/cancelled), lines[], [upcoming_reminded, overdue_reminded]` | invoices/routes, payments/index |
| `payments` | `invoice_id, amount_kopecks, paid_at, method, [bank_ref]` | payments/index |
| `products` | `sku, title, unit, price_kopecks, active` | catalog/routes (price-import) |
| `price_history` | `product_id, sku, old/new_price_kopecks, changed_at, changed_by, source` | catalog/routes |
| `stock` | `product_id, warehouse, qty_on_hand, qty_reserved, reorder_level, updated_at` | ніхто в коді (склад оновлює вручну) |
| `payments_unmatched`, `customer_credits` | створюються `payments/index.js` при першому імпорті; файлів у репозиторії **немає** | payments/index |

**Інші файли.** `out/audit.log` (JSONL), `out/audit-archive/YYYY-MM.jsonl`,
`out/export/oblik-*.csv`, `out/mail/*.txt`; `app/out/` у `.gitignore`.
Вхідні: `data/statements/*.txt` (виписка KB-2), текстовий файл цін закупівель.

**Формат дат.** У сховищі — рядки `YYYY-MM-DD` в UTC (`store.js:9`);
мітки часу (`audit.ts`, `orders.status` `at`) — ISO `toISOString()`.
Коментар у `customers/index.js:26`: «так, це "вчора" до 03:00 за Києвом».
Виняток: `catalog/price-import.js:31` будує дату з **локального** часу.
У репозиторії щонайменше шість незалежних копій `toIsoDate`/`daysBetween`
(`invoices`, `orders`, `customers`, `audit`, `discounts`, `reports/dates`,
`catalog/stock`, `notifications/reminders`).

**Формат грошей.** Цілі копійки, поля з суфіксом `_kopecks`, «never floats».
ПДВ 20 % рахується на підсумок рахунку й округлюється half-up до копійки.

**Де форматуються дати й гроші для людей і машин** (це найважливіша таблиця
для тікета BILL-482):

| Файл | Дата | Гроші | Хто споживає результат |
|---|---|---|---|
| `lib/format.js` | `formatDate` → **`MM/DD/YYYY`** (`03/01/2026`; JSDoc бреше: «ISO format») | `formatMoney` → `1 234,50 грн`; `formatDecimal` → `1234.50` | три споживачі нижче — **одна функція на всіх** |
| `lib/invoices/render.js:38-50` | `format.formatDate` (Дата, Сплатити до) | `format.formatMoney`, `formatPercent` | клієнти (HTML-рахунок) |
| `lib/notifications/reminders.js:39-46` | `format.formatDate` | `format.formatMoney` | клієнти (листи через SMTP-relay) |
| `lib/export/accounting.js:30` | `format.formatDate` для колонок типу `Date` (`DocDate`, `PayUntil`) | `format.formatDecimal` для `Decimal` | **«Облік-Плюс»**, який вимагає саме `MM/DD/YYYY` і мовчки пропускає інші рядки |
| `lib/reports/table.js:14` | — | свій `fmtAmount` → `12 345,67` | місячна пошта, `?format=text`, Excel бухгалтерії |
| `lib/reports/dates.js:50` | `monthName` → «березень 2026»; `toIsoDate` | — | звіти; JSON віддає сирі копійки |
| `lib/customers/index.js:32` | — | свій `fmtAmount` → `5793.05` у `totals.outstanding` | старий адмін-UI через `/api/customers/:id/invoices` |
| `lib/catalog/price-import.js:37` | локальний `toIsoDate` у `price_history.changed_at` | свій `fmtAmount` → `95,50` | текстовий підсумок імпорту |
| `bin/import-statement.js:16` | дати виписки як є | свій `fmtAmount` → `1234.50` | консоль |
| `lib/payments/statement.js` | парсить `DDMMYYYY` з банку → ISO | копійки з банку | — |
| `lib/discounts/index.js:132`, `lib/legacy/templates.js:171` | — | ще два `fmtAmount` | мертвий код |

Разом вісім форматувальників грошей у семи файлах і один спільний
форматувальник дати, який обслуговує і клієнтів, і бухгалтерію.

### Зовнішні інтеграції

`docs/ARCHITECTURE.md` (2019) каже «зовнішні інтеграції: тільки SMTP,
бухгалтерія забирає CSV вручну» — обидва твердження застаріли.

| Хто | Напрям | Формат, як дізнались |
|---|---|---|
| **«Облік-Плюс»** (бухгалтерія, головбух Марина, вн. 214) | вихід | Сервер бухгалтерії сам забирає `out/export/oblik-YYYY-MM-DD.csv` о 06:00 зі змонтованої шари. UTF-8, `;`, CRLF, заголовок, дата **`MM/DD/YYYY`** (американська локаль), суми `1234.50`, текст без `;`. Рядок із датою в іншому форматі **мовчки пропускається** — у лютому 2021 так «зникли» 40 рахунків, помітили через три тижні за звітом з ПДВ. `app/docs/integrations/oblik-plus.md`, `lib/export/accounting.js` |
| **SMTP-relay** | вихід | Забирає файли `To:/Subject:/тіло` з `out/mail/`; у тексті `formatDate` + `formatMoney`. `bin/send-reminders.js:3-4` |
| **Пошта директору та бухгалтерії** | вихід | crontab перенаправляє stdout `monthly-report.js` у лист; текстові таблиці вставляють в Excel, тому без рамок і табуляцій. `bin/monthly-report.js:9-10`, `lib/reports/table.js:4-6` |
| **BI-таблиця** («Олена тягне щопонеділка») | вихід | JSON з `/api/reports/*`, сирі копійки + `generated_at` ISO. `lib/reports/render.js:2-3` |
| **Старий адмін-UI** | вихід | JSON `/api/*`; у підсумках клієнта чекає рядок `5793.05` без пробілів і «грн». `lib/customers/index.js:31` |
| **Reverse proxy + LDAP** | вхід | Ставить `x-staff-id`; без нього `/api/*` → 401. `lib/http/router.js:91-101` |
| **Банк «Банк Вигаданий»** | вхід | Виписка KB-2 фіксованої ширини, cp1251 у банку → UTF-8 через SFTP-міст з 2023; імпорт CLI або `POST /api/payments/import`. `lib/payments/statement.js` |
| **Відділ закупівель** | вхід | Файл `sku;ціна_грн[;примітка]` з Excel, кома або крапка як десятковий знак; `POST /api/products/price-import`. `lib/catalog/price-import.js` |
| Склад | вхід | `stock.json` правлять руками після місячного підрахунку. `lib/catalog/stock.js:6-7` |
| ~~MongoDB, Express, Handlebars, pdf-render~~ | — | Зникли у 2020; лишилися тільки `lib/legacy/*` і застаріла `ARCHITECTURE.md` |

## 3. Перевірка — 20 тверджень

Команди виконано з `app/`. Перевірочний скрипт (п. 6–8, 11–14, 19):

```bash
node -e '
var f = require("./lib/format");
console.log(f.formatDate("2026-03-01"), f.formatMoney(123450), f.formatDecimal(123450));
console.log(require("./lib/reports/table").fmtAmount(1234567), require("./lib/customers").fmtAmount(579305));
var acc = require("./lib/export/accounting"), inv = require("./data/invoices.json"), cus = require("./data/customers.json");
var byId = {}; cus.forEach(function (c) { byId[c.id] = c; });
console.log(acc.buildAccountingFile(inv.slice(0, 1), byId));
console.log(require("fs").existsSync("templates"), require("fs").readdirSync("data").join(", "));'
grep -rl "require(.*audit" lib bin server.js | grep -v lib/audit   # порожньо
grep -rl "discounts" lib bin server.js | grep -v lib/discounts      # порожньо
npm test
```

| # | Твердження з карти | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | HTTP слухає 8080 з `config/default.json`, `PORT` перекриває | ✅ | `app/server.js:38`, `app/config/default.json:7` |
| 2 | `/api/*` без `x-staff-id` → 401; `/invoices/:number` і `/health` відкриті | ✅ | `app/lib/http/router.js:100-101` |
| 3 | Сім модулів маршрутів, 25 маршрутів + `/health` = 26 ендпоінтів | ✅ (число виправлено після QA: спершу було «26 маршрутів», порахованих на око) | `app/server.js:10-18, 29`; `grep -E "method:\|path:" lib/*/routes.js \| wc -l` → 25 (audit 1, catalog 4, customers 5, invoices 4, orders 4, payments 3, reports 4) |
| 4 | Дані — JSON-файли в `data/`, кеш у пам'яті, `save()` переписує файл цілком; відсутній файл = порожня колекція | ✅ | `app/lib/store.js:28-45, 113-117`; тест `missing collection reads as empty` зелений |
| 5 | Дати `YYYY-MM-DD`, гроші — цілі копійки | ✅ | `app/lib/store.js:9`, `app/data/invoices.json:7-12` |
| 6 | `formatDate` віддає `MM/DD/YYYY`, а не ISO, як пише JSDoc | ✅ (JSDoc ❌) | `app/lib/format.js:27,33`; команда → `03/01/2026` |
| 7 | Експорт для «Облік-Плюс» форматує дати тією ж `formatDate` | ✅ | `app/lib/export/accounting.js:30`, `app/config/export-columns.json:3-4`; команда → `INV-2026-00001;03/01/2026;03/15/2026;10000001;ТОВ «Зелений Кут»;4827.50;965.50;5793.00` |
| 8 | Нагадування використовують ту ж `formatDate` і `formatMoney` | ✅ | `app/lib/notifications/reminders.js:39-46` |
| 9 | `ARCHITECTURE.md`: Express, Handlebars, MongoDB, порт 3000, `lib/mail`, `lib/export/csv.js` | ❌ усе застаріло | `app/lib/http/router.js:4-5` (Express прибрали 2020), `app/lib/store.js:1-4`, `app/package.json` без залежностей, `lib/mail` і `csv.js` відсутні у `Glob app/**` |
| 10 | `ARCHITECTURE.md`: «інтеграції тільки SMTP, бухгалтерія забирає CSV вручну» | ❌ | `app/docs/integrations/oblik-plus.md:5-6`, `app/bin/nightly-export.js:4` — забирає сервер о 06:00 |
| 11 | `audit.record()` не викликає жоден модуль поза тестами; `audit/routes.js` стверджує протилежне | ✅ (коментар ❌) | `grep -rl "require(.*audit" lib bin server.js \| grep -v lib/audit` → порожньо; `app/lib/audit/routes.js:2-3` |
| 12 | `lib/discounts` ніхто не `require`-ить поза тестами | ✅ | `grep -rl discounts lib bin server.js \| grep -v lib/discounts` → порожньо; `app/lib/discounts/index.js:7-9` |
| 13 | `features.json → newAgingBuckets` не читає ніхто | ✅ | `Grep newAgingBuckets` знаходить лише сам `config/features.json:3` |
| 14 | `lib/legacy/templates.js` потребує каталогу `templates/`, якого немає | ✅ | команда → `templates dir exists: false`; `app/lib/legacy/templates.js:14` |
| 15 | Розклад cron існує лише в коментарях, crontab у репозиторії немає | ✅ | `Grep -i cron` по `app/` — тільки коментарі в `bin/*`, `lib/audit/*`, `lib/reports/index.js` |
| 16 | `price-import.js` будує дату з локального часу, решта — UTC | ✅ | `app/lib/catalog/price-import.js:30-34` vs `app/lib/orders/index.js:20-25`, `app/lib/reports/dates.js:24-26` |
| 17 | Вісім форматувальників грошей у семи файлах | ✅ | `format.js:40,54`; `reports/table.js:14`; `customers/index.js:32`; `catalog/price-import.js:37`; `bin/import-statement.js:16`; `discounts/index.js:132`; `legacy/templates.js:171` |
| 18 | `payments/index.js` пише в колекції `payments_unmatched` і `customer_credits`, файлів яких у `data/` немає | ✅ | `app/lib/payments/index.js:18-19`; команда → `data files: customers, invoices, orders, payments, price_history, products, statements, stock` |
| 19 | `npm test` зелений | ✅ | `tests 106, pass 106, fail 0` |
| 20 | Жоден тест не покриває `formatDate`, HTML-дату рахунку, дату в нагадуванні чи файл експорту | ✅ | `Grep formatDate\|\d\d/\d\d/\d{4}\|buildAccountingFile\|DocDate` по `app/test/` — один збіг, і той перевіряє, що `03/01/2026` у query → 400 |

## 4. Висновок

**Де помилилась би карта, якби вірити документації.** Три твердження з
`app/docs/ARCHITECTURE.md` виявились хибними і саме їх я перевіряв першими,
бо вони збігаються з тим, що «зазвичай» буває в такому проєкті: Express +
Mongo (п. 9), «інтеграції тільки SMTP» (п. 10) і «форматування дат лише в
шаблонах» (шаблонів немає, форматує `lib/format.js`). Четверте застаріле
твердження — у самому коді: коментар `audit/routes.js` про те, що модулі
пишуть аудит (п. 11). JSDoc `formatDate` обіцяє ISO, а повертає
американський формат (п. 6).

**Найризикованіше для тікета BILL-482.** Тікет каже «здається, це одна
функція, дрібна правка». Це правда рівно наполовину: функція одна
(`format.formatDate`), але в неї три споживачі, і третій — нічний файл для
«Облік-Плюс», який вимагає `MM/DD/YYYY` і **мовчки пропускає** рядки з іншим
форматом (п. 7, `oblik-plus.md`). Жоден тест не зафіксує зміну (п. 20):
`npm test` залишиться зеленим, а бухгалтерія втратить усі рахунки з
наступного експорту, як у лютому 2021. Тому перш ніж міняти `formatDate`,
треба покрити характеризаційним тестом рядок експорту (`DocDate;PayUntil`),
HTML-рахунок і текст нагадування, а правку робити так, щоб колонки типу
`Date` в `export-columns.json` і далі давали `MM/DD/YYYY`.

**Де карта може помилятися зараз.**
- Розклад cron узятий з коментарів; що реально стоїть у crontab на «старому
  сервері», з репозиторію не видно (п. 15). Зокрема невідомо, чи досі
  запускається `retention.js` і чи повернули `import-statement.js`.
- «Живий/мертвий» визначено статичним графом `require`. Динамічний `require`
  чи зовнішній скрипт поза репозиторієм міг би оживити `lib/discounts` або
  `audit.record()`; у коді таких викликів немає.
- Шість файлів `lib/*/routes.js` я не відкривав цілком — таблицю маршрутів
  зібрано через Grep, а поведінку обробників (наприклад, що `invoices/routes`
  переводить замовлення в `invoiced` в обхід `status.js`) взято з коментарів і
  підтверджено лише побічно (`Grep store.save` показує запис `orders` з
  `invoices/routes.js:49`).
- 28 тестів не читав; покриття оцінене лише Grep-ом за назвами функцій (п. 20).
