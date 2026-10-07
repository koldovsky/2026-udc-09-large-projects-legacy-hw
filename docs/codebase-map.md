# Карта кодової бази — `app/`

## 1. Як агент будував карту

- Інструмент / модель: Claude Code (VS Code extension), модель Claude Opus 5.5.
- Промпт (дослівно): «ознайомся з проектом. склади карту app/: точки входу (HTTP,
  cron, CLI), модулі і що вони роблять, як зберігаються дані, які є зовнішні
  інтеграції, де форматуються дати й гроші.»
- Вартість навігації: прочитано весь код `app/` (усі 50 файлів `server.js`,
  `bin/`, `lib/`, `config/`, `docs/`, ≈5 400 рядків), дані — вибірково (перший
  рядок кожної колекції через `node -e`); ≈15 викликів інструментів, ≈170 тис.
  токенів контексту.
- Він прочитав усе підряд чи шукав? Спершу `git ls-files` + `wc -l`, потім
  **прочитав усе підряд** (кодова база мала), далі — цільові перевірки:
  граф `require(...)`, пошук викликачів (`audit.record`, `discounts`,
  `legacy/*`, `merge`), реальний запуск експорту й рендеру рахунку, `npm test`.

## 2. Карта

### Загальна схема (як є насправді)

```
HTTP :8080 ─> server.js ─> lib/http/router.js ─> lib/<модуль>/routes.js ─> lib/<модуль>/*.js ─> lib/store.js ─> data/*.json
cron / CLI ─> bin/*.js ───────────────────────────────────────────────────> lib/* ─> data/*.json, out/*, stdout
```

Plain Node ≥22, CommonJS, колбеки, **жодних npm-залежностей**. Express,
Handlebars, MongoDB і pdf-render з `app/docs/ARCHITECTURE.md` у коді **немає**
(див. розділ 3).

### Точки входу

**HTTP** — [server.js](../app/server.js), порт `config.server.port` = 8080 або
`$PORT`. Роутер власний ([lib/http/router.js](../app/lib/http/router.js)); для
шляхів `/api/*` обов'язковий заголовок `x-staff-id` (його ставить reverse-proxy
після LDAP), інакше 401. Тіло лише JSON.

| Метод | Шлях | Що робить | Файл |
|---|---|---|---|
| GET | `/health` | `{ok:true}` | `server.js` |
| GET | `/invoices/:number` | **HTML-рахунок** (без `x-staff-id`) | `lib/invoices/routes.js` |
| GET | `/api/invoices`, `/api/invoices/:id` | список / один рахунок (JSON) | `lib/invoices/routes.js` |
| POST | `/api/orders/:id/invoice` | виставити рахунок із підтвердженого замовлення, замовлення → `invoiced` | `lib/invoices/routes.js` |
| GET/POST/PATCH | `/api/customers`, `/api/customers/:id`, `/api/customers/:id/invoices` | клієнти: пошук, створення, редагування/деактивація, рахунки клієнта | `lib/customers/routes.js` |
| GET | `/api/products`, `/api/products/:id` | каталог, картка товару (id або SKU) | `lib/catalog/routes.js` |
| POST | `/api/products/price-import` | масове оновлення цін із файлу закупівлі | `lib/catalog/routes.js` |
| GET | `/api/stock/low` | звіт про низькі залишки | `lib/catalog/routes.js` |
| GET/POST | `/api/orders`, `/api/orders/:id`, `/api/orders/:id/status` | замовлення та зміна статусу | `lib/orders/routes.js` |
| GET/POST | `/api/payments`, `/api/payments/import`, `/api/payments/unmatched` | оплати, імпорт виписки KB-2, черга нерозпізнаних | `lib/payments/routes.js` |
| GET | `/api/reports/{revenue,aging,top-customers,vat}` | звіти, JSON або `?format=text` | `lib/reports/routes.js` |
| GET | `/api/audit` | читання журналу аудиту | `lib/audit/routes.js` |

**Cron** (за коментарями в коді; сам crontab лежить «на старому сервері», у
репозиторії його немає):

| Коли | Команда | Що робить | Вихід |
|---|---|---|---|
| 02:30 щоночі | `bin/nightly-export.js` (`npm run export`) | файл для бухгалтерії «Облік-Плюс» | `out/export/oblik-YYYY-MM-DD.csv` |
| 09:00 у робочі дні | `bin/send-reminders.js` (`npm run reminders`) | нагадування «за 3 дні» і «прострочено» | `out/mail/*.txt` |
| 07:00 1-го числа | `bin/monthly-report.js` | місячний звіт (виручка, ПДВ, топ-5, дебіторка) | stdout → лист директору й бухгалтерії |
| 03:10 щодня | `lib/audit/retention.js 365` | переносить старі записи аудиту в архів | `out/audit-archive/YYYY-MM.jsonl` |

**CLI (вручну)**

| Команда | Що робить |
|---|---|
| `bin/import-statement.js <file> [--apply] [--json] [--data-dir]` | імпорт банківської виписки KB-2; за замовчуванням dry run. Колись був cron 07:00, вимкнений у 2022 |
| `bin/render-invoice.js INV-…` | HTML рахунку в stdout |
| `bin/fix-2022-duplicate-customers.js [--apply]` | **одноразовий** фікс дублікатів (BILL-317), уже застосований; не запускати |
| `lib/legacy/mongo-migrate.js <dump>` | **одноразова** міграція MongoDB → JSON (2020); лише для довідки |

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/http/router.js` | мінімальний роутер на `http`, `:param`, `x-staff-id`, JSON/HTML-відповіді | живий |
| `lib/store.js` | JSON-«БД»: lazy-load у пам'ять, `insert/update` лише в кеші, на диск — тільки явним `save(name)` | живий |
| `lib/format.js` | спільні форматери: `formatDate`, `formatMoney`, `formatDecimal`, `formatText`, `formatPercent` | живий, **спільний для HTML, листів і експорту** |
| `lib/invoices/` | номер `INV-YYYY-NNNNN`, ПДВ 20% на субтотал, термін 14 днів, `isOverdue`; `render.js` — HTML рахунку | живий |
| `lib/customers/` | CRUD клієнтів, валідація ЄДРПОУ (контрольна цифра), пошук за назвою; деактивація замість видалення | живий |
| `lib/customers/merge.js` | `planMerge` — план злиття дублікатів (pure) | напівмертвий: лише тести, HTTP/CLI немає |
| `lib/catalog/` | товари, прайс-листи (base/wholesale/dealer), імпорт цін (`price-import.js`), залишки (`stock.js`) | живий |
| `lib/orders/` | створення замовлень (`ORD-YYYY-NNNN`), валідація рядків, машина статусів | живий |
| `lib/payments/` | парсер KB-2 (`statement.js`), зіставлення оплат із рахунками (`matcher.js`), `prepareImport` → `apply` | живий |
| `lib/notifications/reminders.js` | які нагадування потрібні сьогодні і їхній текст | живий (через cron) |
| `lib/export/accounting.js` | CSV для «Облік-Плюс» за `config/export-columns.json` | живий (через cron) |
| `lib/reports/` | виручка, дебіторка (aging), топ-клієнти, ПДВ; власні `dates.js` і `table.js` | живий (HTTP + cron) |
| `lib/audit/` | журнал змін JSONL, `query`, ротація | **читання живе, запису немає**: `audit.record()` ніхто не викликає, тож `out/audit.log` не наповнюється |
| `lib/discounts/` | знижки постійного клієнта за оборотом 12 міс. | **мертвий**: ніхто не `require`, відключений у 2023 (`index.js:7-9`) |
| `lib/legacy/pdf-client.js`, `templates.js` | клієнт pdf-render і міні-Handlebars | **мертві**: сервіс вимкнено у 2020, каталогу `templates/` немає |
| `lib/legacy/mongo-migrate.js` | одноразова міграція | мертвий (довідка) |

`config/features.json`: `loyaltyDiscounts` читає лише мертвий `discounts`;
`newAgingBuckets` не читає ніхто.

### Дані

- **Сховище:** файли `app/data/<колекція>.json` (масив об'єктів, `id` — ціле,
  `max+1`). Колекції: `customers`, `products`, `orders`, `invoices`,
  `payments`, `price_history`, `stock`; створюються на льоту (відсутній файл =
  порожній масив): `payments_unmatched`, `customer_credits`. Блокувань немає:
  рядки з кешу віддаються за посиланням, запис — весь файл цілком.
- **Інші файли:** `out/export/`, `out/mail/`, `out/audit.log`,
  `out/audit-archive/` (у `.gitignore`); `data/statements/2026-03-sample.txt` —
  приклад виписки.
- **Дати:** у даних — рядки `YYYY-MM-DD` (`issued_at`, `due_at`, `paid_at`,
  `created_at`…); мітки часу — повний ISO (`status_history[].at`, аудит `ts`).
  Порівнюються як рядки. «Сьогодні» рахується по-різному: здебільшого UTC
  (`toISOString`), але `catalog/price-import.js:31` — у **локальному** часі, а
  `mongo-migrate.js` — у Europe/Kyiv.
- **Гроші:** цілі **копійки** (`*_kopecks`), ПДВ округлюється half-up від
  субтоталу (`invoices/index.js:19-26`). Вхід у гривнях — лише в імпорті цін
  (`parseHrn`) і в міграції.

#### Де форматуються дати

| Де | Формат | Куди йде |
|---|---|---|
| `lib/format.js:29-34` `formatDate` | **`MM/DD/YYYY`** (JSDoc неправильно каже «ISO») | 1) HTML-рахунок `invoices/render.js:38-39`; 2) листи `notifications/reminders.js:40,46`; 3) **CSV «Облік-Плюс»** — неявно, через `format['format' + col.type]` (`export/accounting.js:29-35`) для колонок типу `Date` |
| `lib/legacy/templates.js:180-184` `dmy` | `DD.MM.YYYY` | мертвий код |
| `lib/reports/dates.js:50-54` `monthName` | `березень 2026` | звіти, заголовок місячного звіту |
| `lib/reports/render.js:40,45-46` | ISO як є | текст дебіторки |
| `lib/payments/statement.js:59-65` | розбір `DDMMYYYY` → ISO | вхід із банку |
| локальні `toIsoDate`: `customers/index.js:27`, `orders/index.js:22`, `catalog/price-import.js:31`, `discounts/index.js:37`, `audit/index.js:47`, `reports/dates.js:24` | ISO | запис у дані |

#### Де форматуються гроші

| Де | Приклад | Куди йде |
|---|---|---|
| `lib/format.js:40-49` `formatMoney` | `1 234,50 грн` | HTML-рахунок, листи-нагадування |
| `lib/format.js:54-60` `formatDecimal` | `1234.50` | CSV «Облік-Плюс» (тип `Decimal`) |
| `lib/customers/index.js:32-37` `fmtAmount` | `5793.00` | `totals.outstanding` у `/api/customers/:id/invoices` |
| `lib/catalog/price-import.js:37-41` `fmtAmount` | `95,50` | звіт імпорту цін |
| `lib/reports/table.js:14-21` `fmtAmount` | `12 345,67` | текстові звіти / лист |
| `bin/import-statement.js:16-21` `fmtAmount` | `1234.50` | консоль |
| `lib/discounts/index.js:132-139`, `lib/legacy/templates.js:171-178` | `14 379,00 грн` / `1 234,50` | мертвий код |

### Зовнішні інтеграції

| Хто | Напрям | Формат / механізм |
|---|---|---|
| **«Облік-Плюс»** (бухгалтерія) | вихід | `out/export/oblik-YYYY-MM-DD.csv`, забирає їхній сервер о 06:00. UTF-8, `;`, CRLF, заголовок, дата **`MM/DD/YYYY`**, сума `1234.50`. Рядок з датою в іншому форматі **тихо пропускається** (інцидент лютого 2021, `app/docs/integrations/oblik-plus.md`). Колонки — `config/export-columns.json` |
| SMTP-релей | вихід | `out/mail/<date>-<kind>-<invoice_id>.txt` (`To:`, `Subject:`, текст); релей сам забирає файли |
| Директор / бухгалтерія | вихід | stdout `monthly-report.js` → лист через cron |
| BI-таблиця (Олена, щопонеділка) | вихід | JSON звітів `/api/reports/*` (`reports/render.js:2-3`) |
| Клієнти | вихід | HTML-рахунок `/invoices/:number`, листи-нагадування |
| Банк «Вигаданий» | вхід | виписка KB-2 fixed-width; `bin/import-statement.js` або `POST /api/payments/import` |
| Відділ закупівель | вхід | текст `sku;ціна_грн[;примітка]` → `POST /api/products/price-import` |
| Reverse-proxy + LDAP | вхід | заголовок `x-staff-id` |
| Складські сканери | вхід | `GET /api/products/:sku` |
| pdf-render, MongoDB | — | вимкнені у 2020, код лишився в `lib/legacy/` |

## 3. Перевірка тверджень

| # | Твердження | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | ARCHITECTURE.md: «Express + Handlebars» | ❌ | власний роутер на `http`, `app/lib/http/router.js:4-5` («We had Express until 2020»); `package.json` без залежностей |
| 2 | ARCHITECTURE.md: «дані в MongoDB» | ❌ | `app/lib/store.js:1-9` — JSON-файли в `data/`; Mongo тільки в одноразовому `lib/legacy/mongo-migrate.js` |
| 3 | ARCHITECTURE.md: «рендер із `templates/*.hbs`, PDF через pdf-render» | ❌ | `ls app/templates` → немає; `invoices/render.js:4-5` — рядкова збірка HTML; `pdf-client.js:7-9` — сервіс вимкнено |
| 4 | ARCHITECTURE.md: «усі дати в ISO, форматування лише в шаблонах» | ❌ | `format.js:33` повертає `MM/DD/YYYY`; `bin/render-invoice.js INV-2026-00007` → `Дата: 03/07/2026` |
| 5 | ARCHITECTURE.md: «єдина інтеграція — SMTP, CSV бухгалтерія забирає вручну» | ❌ | `bin/nightly-export.js:3-4`, `oblik-plus.md:5-6` — сервер «Облік-Плюс» забирає автоматично; плюс банк і закупівлі |
| 6 | ARCHITECTURE.md: порт 3000, `lib/export/csv.js`, `lib/mail` | ❌ | `config/default.json` → 8080; файлів `csv.js` і `lib/mail` немає (`git ls-files`) |
| 7 | JSDoc `formatDate`: «returns the date in ISO format» | ❌ | `format.js:27` vs `format.js:33` |
| 8 | Експорт «Облік-Плюс» використовує `formatDate`, хоч grep по імені цього не показує | ✅ | `export/accounting.js:30` `format['format' + col.type]` + `export-columns.json` `"type": "Date"`; прогін `buildAccountingFile` → `INV-2026-00001;03/01/2026;03/15/2026;…` |
| 9 | Гроші зберігаються в цілих копійках | ✅ | `store.js:9`; `data/invoices.json` → `subtotal_kopecks: 482750` |
| 10 | `lib/discounts` ніхто не викликає | ✅ | граф `require` по `server.js bin lib` — лише тести; `discounts/index.js:7-9` |
| 11 | Журнал аудиту ніхто не пише | ✅ | `grep -rn "record(" lib bin server.js` поза `lib/audit` → порожньо |
| 12 | Для `formatDate` і експорту немає тестів | ✅ | `test/format.test.js` — тільки Money/Decimal/Text/Percent; `grep -rl accounting test` → порожньо |
| 13 | Сирий `npm test` зелений | ✅ | `cd app && npm test` → 106 pass, 0 fail |

## 4. Висновок

`app/docs/ARCHITECTURE.md` (2019) майже повністю застарів: стек, сховище,
шаблони, порт, назви модулів і «лише SMTP» не відповідають коду. Документ
`docs/integrations/oblik-plus.md` (2021), навпаки, актуальний і найважливіший.

Найризикованіше місце для тикета BILL-482: `formatDate` у `lib/format.js` —
одна функція на трьох споживачів. HTML-рахунок і листи треба перевести на
`дд.мм.рррр`, а CSV для «Облік-Плюс» **мусить лишитися `MM/DD/YYYY`**. Зв'язок
з експортом видно лише за динамічним викликом `format['format' + col.type]`,
тож пошук за іменем функції його пропускає, а тестів на дату й експорт
немає. Якщо змінити `formatDate` «в лоб», рахунки тихо випадуть з обліку, як
у лютому 2021.


