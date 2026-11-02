# Карта кодової бази — `app/`

## 1. Як агент будував карту

- **Інструмент / модель:** Claude Code 2.1.316, headless-прогін `claude -p --model sonnet` (Claude Sonnet 5.5). Окремий процес у чистому клоні, з якого прибрано файли курсу (кореневі `README.md`, `AGENTS.md`, `CLAUDE.md`, `.coderabbit.yaml`, `.github/`, `docs/`, `materials/`). Так агент не бачив підказок курсу. `app/README.md` і `app/docs/` лишились, бо це частина системи. Дозволені інструменти: `Read, Glob, Grep, Bash`, лише читання.
- **Промпт (дослівно):** «Склади карту кодової бази app/: точки входу (HTTP, cron, CLI), модулі і що вони роблять (живі чи мертві), як зберігаються дані, які є зовнішні інтеграції, де форматуються дати й гроші. Відповідь — Markdown-документ українською з таблицями. Код не змінюй.»
- **Вартість навігації** (з `result` у `--output-format stream-json`):
  - 7 ходів, **6 викликів інструментів** (1 × `Glob`, 5 × `Bash`; `Read` жодного разу);
  - ≈ **40 файлів** переглянуто через `cat`/`head`/`sed -n`. Повністю прочитано ≈ 20: `app/README.md`, обидва `app/docs/*`, `config/*`, `server.js`, `router.js`, `store.js`, `format.js`, усі `bin/*.js`, `export/accounting.js`, `reminders.js`, `invoices/*`. Решту видно лише головами по 15–50 рядків;
  - токени: input 12 + cache write 45 886 + cache read 203 706, output 8 120 (з них thinking 620). Вартість **$0.285**, тривалість 63 с.
- **Читав усе підряд чи шукав?** Комбінація. Спершу один `Glob app/**/*` і великий `cat` «опорних» файлів, включно зі старою документацією. Далі агент шукав цілеспрямовано: `grep` по `require(` будував граф залежностей, `grep` по `formatDate|toISOString|toLocale|/ 100` знаходив форматування, а живі й мертві модулі він відрізняв пошуком імпортів. Решту модулів дивився тільки по шапці (`head -30`). Тому частину тверджень він узяв із коментарів, а не з коду (див. розділ 3).

## 2. Карта (те, що видав агент, з моїми правками)

> Правки позначено **[виправлено]**. Повний вихід агента дослівно не наводжу: нижче його таблиці, стиснуті без втрати фактів.

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP, порт 8080 (`config/default.json`) або `PORT` | Власний роутер; модулі підключаються списком `MODULES` і **мовчки пропускаються** при `MODULE_NOT_FOUND` | `server.js:10-29`, `lib/http/router.js` |
| HTTP `GET /invoices/:number` | HTML рахунку для клієнта (без `x-staff-id`) | `lib/invoices/routes.js:28-37,63` |
| HTTP `/api/*` (26 маршрутів: invoices, customers, catalog, orders, payments, reports, audit) | JSON API. Без `x-staff-id` повертає 401 | `lib/*/routes.js`, `lib/http/router.js:100-101` |
| cron 02:30 | Нічний CSV для «Облік-Плюс» → `out/export/oblik-YYYY-MM-DD.csv` | `bin/nightly-export.js` (`npm run export`) |
| cron 09:00 (робочі дні) | Листи-нагадування `.txt` у `out/mail`, їх забирає SMTP-relay | `bin/send-reminders.js` (`npm run reminders`) |
| cron 07:00 першого числа | Місячний звіт у stdout, його пайпиться в пошту | `bin/monthly-report.js` |
| cron 03:10 | Архівація журналу аудиту | `lib/audit/retention.js` (запускається напряму) |
| CLI вручну | Імпорт банківської виписки (dry-run, `--apply`). Cron вимкнено у 2022 | `bin/import-statement.js` |
| CLI вручну | HTML рахунку в stdout | `bin/render-invoice.js` |
| CLI, **не запускати** | Разова правка дублів 2022 | `bin/fix-2022-duplicate-customers.js` |
| CLI, разово 2020 | Міграція MongoDB → JSON | `lib/legacy/mongo-migrate.js` |

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/http/router.js` | Роутер, `:param`, JSON-тіло, перевірка **наявності** `x-staff-id`. Справжність значення не перевіряється, довіряє proxy | Живий |
| `lib/store.js` | JSON-«БД» у `data/*.json`, кеш у пам'яті, запис лише на `save()` | Живий |
| `lib/format.js` | `formatDate/Money/Decimal/Text/Percent`. **Спільний для людей (рахунок, листи) і машини (експорт)** | Живий, найризикованіший |
| `lib/invoices` | Нумерація `INV-YYYY-NNNNN`, ПДВ 20 %, строк 14 днів, HTML-рендер рядками | Живий |
| `lib/notifications/reminders.js` | Чиста логіка, який лист потрібен і з яким текстом | Живий |
| `lib/export/accounting.js` | CSV для «Облік-Плюс». Колонки з `config/export-columns.json`, форматер обирається **за іменем** `format['format' + col.type]` | Живий, критичний |
| `lib/customers` (+`validate`, `search`) | CRUD клієнтів, ЄДРПОУ, пошук | Живий |
| `lib/customers/merge.js` | `planMerge()` | Мертвий (ніхто не імпортує, лише тест) |
| `lib/orders` | Замовлення, рядки, машина статусів | Живий |
| `lib/catalog` | Каталог, залишки, імпорт цін | Живий |
| `lib/payments` | Парсер KB-2, зіставлення, імпорт | Живий |
| `lib/reports` | Виручка, aging, топ, ПДВ. **Власні** `dates.js` і `table.js`, `lib/format.js` не використовує | Живий |
| `lib/audit` | Журнал `out/audit.log`, читання, ротація | Напівмертвий: `audit.record()` не викликає жоден робочий модуль (лише тести `test/audit/record.test.js`) |
| `lib/discounts` | Знижки постійним клієнтам (прапорець `loyaltyDiscounts`) | Мертвий («Nothing calls this module») |
| `lib/legacy/pdf-client.js`, `templates.js` | PDF-сервіс і міні-Handlebars із власним хелпером `date` → `DD.MM.YYYY` | Мертві (`templates/` немає, сервіс вимкнено у 2020) |
| `lib/legacy/mongo-migrate.js` | Разова міграція | Мертвий |

### Дані

- Колекції лежать у `data/*.json`, по файлу на колекцію, масив об'єктів із цілим `id` (`lib/store.js`). Окремої БД немає, MongoDB лишилась лише в історії.
- **Дати** зберігаються рядками `YYYY-MM-DD` (`lib/store.js:9`, `lib/format.js:19`).
- **Гроші** зберігаються цілими копійками в полях `*_kopecks`. Виняток: прайс закупівель приходить у гривнях (`lib/catalog/price-import.js`).
- `insert/update` змінюють лише кеш. На диск пише тільки `store.save(name)`, перезаписуючи весь файл. Блокувань між сервером і cron немає.
- Згенеровані файли лежать в `out/export/`, `out/mail/`, `out/audit.log` (у `.gitignore`).

### Зовнішні інтеграції

| Хто споживає / постачає | Напрямок | Формат |
|---|---|---|
| **«Облік-Плюс» (бухгалтерія)** — **машина** | вихід, щоночі у змонтовану шару, о 06:00 забирають самі | CSV, `;`, CRLF, UTF-8. **Дата `MM/DD/YYYY`**, суми `1234.50`. Рядок з іншим форматом дати **мовчки пропускається** (`app/docs/integrations/oblik-plus.md`) |
| Клієнти (люди) | вихід | HTML рахунку (`/invoices/:number`, `bin/render-invoice.js`), листи-нагадування (`out/mail/*.txt` → SMTP-relay) |
| Директор / бухгалтерія (люди) | вихід | Місячний звіт (текст у пошту) |
| Банк, виписка KB-2 | вхід | Fixed-width, дати `DDMMYYYY` (`lib/payments/statement.js:14-20`) |
| Відділ закупівель | вхід | `sku;ціна[;примітка]` |
| Reverse proxy + LDAP | вхід | Заголовок `x-staff-id` |
| `pdf-render`, MongoDB | — | Мертві з 2020 |

### Де форматуються дати й гроші

| Що | Де | Хто використовує |
|---|---|---|
| `formatDate` → `MM/DD/YYYY` | `lib/format.js:29-34` до BILL-482 | **До BILL-482** (так агент побачив код): `invoices/render.js:38-39`, `reminders.js:40,46` і **`export/accounting.js:30` — без імені, через тип колонки `Date`**. **Після BILL-482** — лише експорт (машинний контракт, не змінювати) |
| `formatDisplayDate` → `дд.мм.рррр` | `lib/format.js` (додано в BILL-482) | `invoices/render.js:38-39`, `reminders.js:40,46` — дати, які читають люди |
| `formatMoney` → `1 234,50 грн` | `lib/format.js:40` | рахунок, листи |
| `formatDecimal` → `1234.50` | `lib/format.js:54` | експорт (тип `Decimal`) |
| Власні копії грошей | `reports/table.js:14`, `customers/index.js:32`, `discounts/index.js:132`, `catalog/price-import.js`, `bin/import-statement.js`, `legacy/templates.js` | `lib/format.js` не чіпають |
| Власні дати | `reports/dates.js` (ISO, назви місяців), `legacy/templates.js` (`dmy` → `DD.MM.YYYY`, мертвий), `payments/statement.js` (парсинг `DDMMYYYY`) | `lib/format.js` не чіпають |
| «Сьогодні» = `toISOString().slice(0,10)`, тобто UTC | `invoices/routes.js:44`, `customers/index.js:28`, `bin/nightly-export.js:12`, `bin/send-reminders.js:12`, `payments/matcher.js:47`, `audit/index.js:48` | До 02:00 (взимку, UTC+2) або 03:00 (влітку, UTC+3) за Києвом це «вчора». **[виправлено]**: агент зарахував сюди `invoices/index.js` і `orders/status.js`, але там `toISOString` використовується для інших цілей (див. твердження 9) |

## 3. Перевірка — щонайменше 10 тверджень

Першими перевіряв твердження, які агент **міг узяти з тексту замість коду**: зі старої `app/docs/`, із коментарів-шапок (`head -30`) і з докстрінгів. Далі йшли твердження, від яких залежить тікет.

| # | Твердження з карти | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | `formatDate` повертає `MM/DD/YYYY`, а не ISO, як каже його докстрінг | ✅ | `lib/format.js:33` повертає `pad(month)+'/'+pad(day)+'/'+year`, а `lib/format.js:27` пише «returns the date in ISO format». Тест: `format.formatDate('2026-03-09') === '03/09/2026'` (`app/test/characterization/dates.test.js`) |
| 2 | Експорт для «Облік-Плюс» форматує дати через `formatDate`, хоча його ім'я ніде не згадує | ✅ | `lib/export/accounting.js:30`: `format['format' + col.type]`; `config/export-columns.json:3-4`: `"type": "Date"`. `grep -rn formatDate lib/export` нічого не знаходить |
| 3 | `app/docs/ARCHITECTURE.md` застарів: Express, Handlebars, MongoDB, `lib/mail`, `lib/export/csv.js`, порт 3000 | ✅ | `lib/http/router.js:4` («We had Express until 2020»), `ls app/templates` → нема, `ls lib` (немає `mail`, у `export/` лише `accounting.js`), `config/default.json:7` → `8080` |
| 4 | «Зовнішні інтеграції: тільки SMTP» зі старої документації неправда, бо є нічний файл для «Облік-Плюс» | ✅ | `bin/nightly-export.js:3-4`, `config/default.json:9`, `app/docs/integrations/oblik-plus.md` |
| 5 | `/invoices/:number` доступний без `x-staff-id`, `/api/*` без нього дає 401 | ✅ | `lib/http/router.js:100-101`: перевірка лише для шляхів, що починаються з `/api/` |
| 6 | «Сам сервер заголовок **не перевіряє**, довіряє proxy» | ⚠️ частково | Наявність заголовка перевіряється (`router.js:101`, 401). Не перевіряється лише справжність значення. Формулювання агента надто сильне |
| 7 | `lib/discounts` мертвий: прапорець `loyaltyDiscounts` нічого не вмикає | ✅ | `grep -rn "require('../discounts')\|require('./discounts')" lib bin server.js` → порожньо. Коментар `lib/discounts/index.js:7-9` збігається з кодом |
| 8 | `audit.record()` не викликає жоден робочий модуль (лише тести), журнал у продакшні порожній | ✅ | `grep -rn "audit\.record\|\.record(" lib bin \| grep -v ^lib/audit` → порожньо. `require('../audit')` теж ніде немає |
| 9 | «Сьогодні» через `toISOString` (UTC) береться в `invoices/index.js` і `orders/status.js` | ❌ | `lib/invoices/index.js:8-12` — це `addDays()`, арифметика над переданою датою, а не «сьогодні». `lib/orders/status.js:90` бере повний timestamp без `slice`, тобто це не дата. Агент склав список за `grep toISOString`, не дивлячись на контекст. Справжнє «сьогодні» при виставленні рахунку визначається в `lib/invoices/routes.js:44` |
| 10 | Прапорці `upcoming_reminded` / `overdue_reminded` ніхто не записує, тому лист «прострочено» може йти щодня | ✅ | `grep -rn "_reminded" lib bin \| grep -v ^lib/notifications` → порожньо. `bin/send-reminders.js` нічого не позначає |
| 11 | `newAgingBuckets` у `config/features.json` ніхто не читає | ✅ | `grep -rn newAgingBuckets lib bin` → порожньо |
| 12 | `lib/customers/merge.js` ніхто не імпортує | ✅ | `grep -rn "merge'" lib bin` → порожньо, є лише тест `test/customers/search-merge.test.js` |
| 13 | `lib/legacy/templates.js` має власний хелпер дат у `DD.MM.YYYY`, і він мертвий | ✅ | `lib/legacy/templates.js:180-184` (`dmy`). Імпортує його лише `lib/legacy/pdf-client.js:16`, який ніхто не імпортує (`grep -rn "pdf-client" lib bin server.js` → порожньо). `ls app/templates` → нема |
| 14 | Звіти (`lib/reports`) мають власні форматери і `lib/format.js` не використовують | ✅ | `grep -n "require" lib/reports/*.js`: лише `./dates`, `./table`, `../store`, `../http/router` |
| 15 | «Розвести формат для людей і для експорту, не зачепивши експорт, **не можна**» (розділ 5 карти агента) | ❌ | Можна, і саме так зроблено в Task C: людські рендери перейшли на окрему функцію, а `formatDate`, на який дивиться експорт, лишився без змін. Golden master CSV байт-у-байт той самий (`app/test/characterization/golden/oblik-export.csv`). Агент змішав «не можна змінити `formatDate` на місці» з «не можна взагалі» |
| 16 | `bin/import-statement.js` більше не в cron | ✅ (за коментарем) | `bin/import-statement.js:7-9`. Сам crontab лежить «на старому сервері», у репо його немає, тож у коді це не перевірити |

## 4. Висновок

Карта загалом **точна щодо коду**: старій `app/docs/ARCHITECTURE.md` агент не повірив. Він сам виписав розбіжності в окрему таблицю «документація бреше» (твердження 3–4) і знайшов найважливіше для тікета: дати в CSV для «Облік-Плюс» йдуть через `formatDate`, хоча пошук за ім'ям цього не покаже (твердження 2).

Помилився він у двох місцях і ще в одному перебільшив. Причина одна: висновки за результатом `grep` або за коментарем, без читання коду навколо.

- **№ 9:** список місць, де береться «сьогодні», зібрано за `grep toISOString`. Два з восьми рядків стосуються іншого.
- **№ 15:** ризик перебільшено до «неможливо». Якби наступний розробник повірив карті, він би пішов «узгоджувати з бухгалтерією» зміну, якої бухгалтерія взагалі не помітить.
- **№ 6:** правдиве твердження сформульоване надто сильно.

Чому саме ці перевірки найризикованіші. Агент повністю прочитав `app/docs/*` першим же викликом, тож найімовірніше він міг перенести звідти застарілі факти. Тому я перевірив усе, що збігається зі старою документацією або з коментарями-шапками (№ 3, 4, 7, 13, 16). Другим пріоритетом були твердження, від яких залежить BILL-482: хто споживає `formatDate` і в якому форматі (№ 1, 2, 14, 15). Стан «живий / мертвий» перевірено пошуком імпортів, а не за коментарями (№ 7, 8, 12, 13), бо коментарі в цьому репо самі можуть бути застарілими (як докстрінг у № 1).
