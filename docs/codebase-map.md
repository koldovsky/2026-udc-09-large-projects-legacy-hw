# Карта кодової бази — `app/`

> Task A. Карту склав і перевірив агент. Потім її незалежно перевірено вдруге — факти, вимоги завдання,
> повнота, методологія, мова — і внесено правки, підтверджені по коду.
> Кожне твердження в розділі 3 має `файл:рядок` або команду, яку може повторити будь-хто.
> Шляхи без `lib/` — відносно `app/lib/`. Позначка **\*** — факт лише з коментарів чи документації,
> кодом його не перевірити.

## 1. Як агент будував карту

- **Інструмент / модель:** Claude Code, Claude Opus 5.5 (`claude-opus-5-5`).
- **Промпт (стисло):** скласти карту `app/`: точки входу (HTTP, cron, CLI), модулі і що вони роблять, як
  зберігаються дані, які є зовнішні інтеграції, де форматуються дати й гроші.
- **Вартість навігації (наближено):**
  - перша версія — **~21 виклик**, **~75 тис.** токенів контексту. Повністю прочитано 23 із 86 файлів,
    ще 24 — лише заголовки, 5 — лише grep. Тести й дані не відкривались: дані перевірено запуском коду;
  - повторна перевірка і правки — **~160 викликів**, **~0,6 млн** токенів.
- **Читав усе підряд чи шукав?** Шукав. Послідовність:
  1. Точки входу.
  2. Граф імпортів (`grep require(`).
  3. `format.js` і його імпортери.
  4. grep динамічних викликів (`obj['prefix' + x]`) і механіки форматування (`getUTC*`, `/ 100`), а не
     назв функцій.
  5. Запуск коду.

  Кожен файл коду все ж переглянуто (хоча б заголовок чи grep), бо карта охоплює весь `app/`.

## 2. Карта (те, що видав агент, з вашими правками)

Node ≥ 22, CommonJS, колбеки, **жодної npm-залежності**, 133 тести (`node --test`): 106 початкових, 21 додано
для BILL-482 (у Task B, до зміни коду) і 6 — після мутаційного тестування (Task E).

_Правки після повторної перевірки:_
- приклади тепер із реальних запусків;
- уточнено твердження про часовий пояс і «динамічний імпорт»;
- додано 2 колекції, щоденні нагадування й розділ «Ризики».

_Після BILL-482 (Task C):_
- дати для клієнтів форматує нова `formatDateUa`;
- CSV для «Облік-Плюс» тепер під тестами;
- посилання й приклади відповідають поточному коду.

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| **HTTP** `npm start`, порт 8080 | 25 маршрутів у 7 `lib/*/routes.js` + `/health`. Модулі підключаються за рядками з масиву (`require(m)`) | `server.js:10-24,29,38` |
| HTTP **без автентифікації** | `GET /invoices/:number` (HTML-рахунок для клієнта) і `/health`. `x-staff-id` перевіряється лише для `/api/*` | `http/router.js:101` |
| cron* 02:30 | `bin/nightly-export.js` → `out/export/oblik-YYYY-MM-DD.csv` для «Облік-Плюс» | `bin/nightly-export.js:3-4` |
| cron* 09:00, робочі дні | `bin/send-reminders.js` → листи-файли `out/mail/*.txt` для SMTP-релею | `bin/send-reminders.js:3-4` |
| cron* 07:00, 1-ше число | `bin/monthly-report.js` → stdout → пошта директору й бухгалтерії | `bin/monthly-report.js:9-10` |
| cron* 03:10 | `lib/audit/retention.js 365` → архів журналу аудиту | `audit/retention.js:5` |
| CLI | `bin/import-statement.js` (виписка банку, за замовчуванням dry run), `bin/render-invoice.js` | `bin/import-statement.js:5-10` |
| CLI — **не запускати** | `bin/fix-2022-duplicate-customers.js` (уже застосовано), `legacy/mongo-migrate.js` (мертвий) | `bin/fix-2022-duplicate-customers.js:3-6` |

- **Маршрути за модулями:** invoices 4, customers 5, catalog 4, orders 4, payments 3, reports 4, audit 1.
- **Змінні середовища:** `PORT`, `AUDIT_DIR`, `AUDIT_RETENTION_DAYS`, `STAFF_ID`.
- **Розклад cron** відомий лише з коментарів: crontab у репо немає.

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `store.js` | JSON-файли як «база»: кеш у пам'яті, перезапис цілого файлу в `save()` | Живий |
| `http/router.js` | Маршрути з `:param`, JSON/HTML, перевірка `x-staff-id` для `/api/*` | Живий |
| `format.js` | `formatDate` (`MM/DD/YYYY`, для «Облік-Плюс»), `formatDateUa` (`дд.мм.рррр`, для людей; BILL-482), `formatMoney`, `formatDecimal`, `formatText`, `formatPercent` | Живий. 3 статичні імпортери; експорт обирає функцію **за іменем** (`export/accounting.js:30`) |
| `invoices/` | Рахунок із замовлення (ПДВ 20 %, строк 14 днів), HTML | Живий |
| `notifications/reminders.js` | Листи «скоро строк» / «прострочено» | Живий |
| `export/accounting.js` | CSV для «Облік-Плюс»; колонки й типи — з `config/export-columns.json` | Живий |
| `customers/`, `orders/`, `catalog/` | Клієнти (ЄДРПОУ, пошук), замовлення (машина станів), товари, ціни, залишки | Живі. `customers/merge.js` — лише тести |
| `payments/` | Розбір виписки KB-2, зіставлення з рахунками, імпорт (план → застосування) | Живий |
| `reports/` | Виручка, дебіторка, топ клієнтів, ПДВ; **власні** хелпери дат і грошей | Живий |
| `audit/` | Журнал `out/audit.log`, читання, ротація | **Напівживий**: `audit.record()` викликають лише тести, робочий код — ні |
| `discounts/` | Знижки постійного клієнта, прапорець `loyaltyDiscounts=false` | **Мертвий**: лише тести |
| `legacy/` | Клієнт PDF-сервісу, міні-Handlebars, міграція з MongoDB | **Мертвий**: живий код не імпортує |

### Дані

- **Сховище:** JSON-масиви в `app/data/`, доступ лише через `store.js`. Колекції: `customers`, `products`,
  `orders`, `invoices`, `payments`, `price_history`, `stock`. Ще дві з'являються після першого застосування імпорту оплат:
  `payments_unmatched`, `customer_credits` (`payments/index.js:18-19`). **Бази даних немає.**
- **Дати** — рядки `YYYY-MM-DD`, **гроші** — цілі копійки (`store.js:9`; К2).
- **Конфіг:** `config/default.json`, `config/export-columns.json` (**контракт з «Облік-Плюс»**), `config/features.json`.
- **Вихід:** `out/export/`, `out/mail/`, `out/audit.log`. У `.gitignore`, не комітити.

### Зовнішні інтеграції

| Хто | Канал | Формат | Читач |
|---|---|---|---|
| **«Облік-Плюс»** (бухгалтерія) | CSV щоночі, забирають о 06:00* | `;`, CRLF, **дати `MM/DD/YYYY`**, суми `5793.00`. Рядок із чужою датою мовчки пропускає* | **Система** |
| Клієнти | HTML-рахунок; листи через SMTP-релей* | Дати — `formatDateUa` (`дд.мм.рррр`), гроші — `formatMoney` | **Людина** (ім'я файлу й заголовки листа читає релей) |
| Директор, бухгалтерія | Місячний звіт поштою* | Текстова таблиця | **Людина** |
| BI-таблиця, старий адмін-UI* | JSON `/api/*` | Дати ISO | **Система** |
| Банк, відділ закупівель | Вхід: виписка KB-2, файл цін | `DDMMYYYY`; `sku;ціна` | — |

### Де форматуються дати й гроші

| Де | Вихід | Приклад (запуск) | Читач | Через `format.js` |
|---|---|---|---|---|
| `invoices/render.js:38-39` → `formatDateUa` | Дати в HTML-рахунку | `07.03.2026` (К3) | Клієнт | Так |
| `notifications/reminders.js:40,46` → `formatDateUa` | Дата в листі | `16.03.2026` (К5) | Клієнт | Так |
| `export/accounting.js:30` → `format['format' + type]` | `DocDate`, `PayUntil` у CSV | `03/01/2026` (К1) | **«Облік-Плюс»** | **Так, опосередковано** — слова `formatDate` там немає |
| `format.js:55-89` | Гроші, текст, %: HTML і листи / CSV | `1 542,00 грн` (К5) / `4827.50` (К1) | Люди / система | Так |
| `reports/dates.js`, `reports/table.js` | Звіти | `березень 2026`, `74 955,00` (К6) | Люди, BI | Ні |
| Локальні `fmtAmount` у `customers/`, `catalog/price-import.js`, `bin/import-statement.js` | API, повідомлення, CLI | `1234.50`, `95,50` (К7) | Адмін-UI, працівники | Ні |
| Внутрішні дати, JSON API | Сирі значення | `2026-03-21` | Системи | Ні |

**Висновок:**
- **До BILL-482** `formatDate` формувала два виходи для людей і один для машини. Машинний вихід діставався до
  неї через ім'я з конфігу.
- **Тепер** `formatDate` (`format.js:34-39`) лишилася тільки для «Облік-Плюс». Людям дати форматує
  `formatDateUa` (`format.js:44-49`).

### Ризики й неочевидні факти

- **До BILL-482 CSV не був захищений тестами.** Формат дати фіксував лише `test/invoices.test.js:41-42`, тож зміна
  `formatDate` змінила б CSV без жодного червоного тесту. Тепер файл байт у байт фіксує
  `test/characterization/oblik-export.test.js`.
- **Імена в `format.js` — це допустимі `type` у конфігу.** Перейменування `formatDate` зламає нічний експорт
  (`accounting.js:31-33`). Після BILL-482 допустимим став і `DateUa`; для «Облік-Плюс» його не вказувати.
- **Битий `require` у модулі маршрутів мовчки прибирає його маршрути** (`server.js:25-26`).
- **Прострочене нагадування йде щодня:** прапорців `*_reminded` ніхто не ставить (К5: 27 листів щодня).
- **Сховище:**
  - кеш ніколи не скидається (`store.js:29`);
  - `save()` неатомарний (`store.js:116`);
  - `POST /api/payments/import` застосовує зміни одразу, якщо не передати `dry_run` (`payments/routes.js:33-39`).
- **«Сьогодні» рахується за UTC:** до 02:00–03:00 за Києвом це вчорашня дата (`customers/index.js:26`).
- **Дати не валідуються:** `formatDate('2026-02-30')` → `03/02/2026` (К7).

## 3. Перевірка — щонайменше 10 тверджень

Пункти 1–15 — твердження **джерел** (стара документація, коментарі), з яких агент міг узяти карту. Їх
перевірено першими. ❌ тут означає: **джерело хибне, карта його не повторила**. Пункти 16–18 — висновки
самої карти.

| # | Твердження з карти | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | «Billing — це Express-застосунок» (`app/docs/ARCHITECTURE.md:7`) | ❌ | `package.json` без `dependencies`; `server.js:5` — модуль `http`; `router.js:4-5`: "We had Express until 2020" |
| 2 | «Усі сторінки й документи рендеряться з `templates/`» (`ARCHITECTURE.md:7-8`) | ❌ | `ls app/templates` → немає; `invoices/render.js:4-5` будує HTML рядками |
| 3 | «Дані лежать у MongoDB»; «Node 8+ і MongoDB 3.6» (`ARCHITECTURE.md:8,39`) | ❌ | `store.js:4-5` — JSON-файли; `legacy/mongo-migrate.js:3-4` — міграція 2020 року; `engines.node: ">=22"` |
| 4 | «PDF через сервіс `pdf-render`» (`ARCHITECTURE.md:20`) | ❌ | `legacy/pdf-client.js:8-9`: вимкнено у 2020; `grep -rn "pdf-client" lib bin server.js test` → нічого |
| 5 | «`lib/export/csv.js`», «`lib/mail` — SMTP» (`ARCHITECTURE.md:22-23`) | ❌ | Обох шляхів немає (`ls`); експорт — `export/accounting.js`, листи — файли (`bin/send-reminders.js:21-25`) |
| 6 | «Усі дати зберігаються й передаються в ISO 8601» (`ARCHITECTURE.md:27-28`) | ❌ | Зберігаються — так (К2); передаються — ні: К1 → `03/01/2026` (`format.js:38`) |
| 7 | «Гроші — цілі копійки» (`ARCHITECTURE.md:29`) | ✅ | К2: 372 поля `*_kopecks`, нецілих — 0 |
| 8 | «Зовнішні інтеграції: тільки SMTP» (`ARCHITECTURE.md:30`) | ❌ | `grep -rni smtp lib bin server.js` → лише коментар; є виписка KB-2 (`payments/routes.js:61`), імпорт цін (`catalog/routes.js:92`), CSV для «Облік-Плюс» (`bin/nightly-export.js:24-25`) |
| 9 | «`npm install`», «`npm start   # http://localhost:3000`» (`ARCHITECTURE.md:35-36`) | ❌ | Залежностей немає, `npm test` → усі 133 pass без `install`; порт 8080 (`config/default.json:7`) |
| 10 | «Дата — `MM/DD/YYYY`» (`app/docs/integrations/oblik-plus.md:23`) | ✅ | `export-columns.json:3-4` (`Date`) → `accounting.js:30` → `format.js:38`; К1 |
| 11 | «UTF-8, `;`, CRLF, заголовки першим рядком; суми з крапкою без «грн»; текст без `;`» (`oblik-plus.md:19-25`) | ✅ | `accounting.js:12-13,43-49`; `format.js:69-75,81-84`; `bin/nightly-export.js:25` (`'utf8'`); К1, К7 |
| 12 | JSDoc `formatDate`: "the date in ISO format" (`format.js:27` до BILL-482) | ❌ | `git show fcab2c6:app/lib/format.js \| sed -n 27p` → цей текст; а функція повертала й повертає `MM/DD/YYYY` (`format.js:38`; К1 → `03/01/2026`). JSDoc виправлено в BILL-482 |
| 13 | "Anything without it [`x-staff-id`] is rejected" (`router.js:92-93`) | ❌ | `router.js:101` перевіряє лише `/api/*`; К4: `/invoices/…` без заголовка → 200, `/api/invoices` → 401 |
| 14 | "entries are written by the modules … through audit.record()" (`audit/routes.js:2-3`) | ❌ | `grep -rn "\.record(" lib bin` → лише цей коментар |
| 15 | "Nothing calls this module" — знижки (`discounts/index.js:7`) | ✅ | `grep -rnE "require\(.*discounts" lib bin server.js` → нічого; імпортують лише 2 тестові файли (`test/discounts/*.test.js`) |
| 16 | Карта: «`format.js` імпортують 3 модулі; експорт бере `formatDate` за іменем, зібраним під час виконання» | ✅ | `grep -rnE "format(\.js)?['\"]\)" lib bin server.js` → `accounting.js:9`, `render.js:7`, `reminders.js:4`; `grep -rn formatDate lib/export config` → 0 |
| 17 | Карта: «звіти не залежать від `format.js`» | ✅ | `grep -hoE "require\([^)]*\)" lib/reports/*.js lib/store.js lib/http/router.js \| sort -u` → `../format` немає |
| 18 | Карта: «26 HTTP-маршрутів» | ✅ | `grep -rhE "path: '" lib/*/routes.js \| wc -l` → 25, + `/health` (`server.js:29`) |

**Команди** (Git Bash, з `app/`; нічого не записують):

```bash
# К1 — перші рядки CSV для «Облік-Плюс» (у пам'яті)
node -e "var a=require('./lib/export/accounting'),c={};require('./data/customers.json').forEach(function(x){c[x.id]=x});console.log(JSON.stringify(a.buildAccountingFile(require('./data/invoices.json'),c).split('\r\n').slice(0,2)))"
# К2 — дати рахунків ISO; усі *_kopecks — цілі
node -e "var re=/^\d{4}-\d{2}-\d{2}$/,i=require('./data/invoices.json'),n=0,bad=0;console.log(i.length+' invoices, ISO dates: '+i.every(function(x){return re.test(x.issued_at)&&re.test(x.due_at)}));require('fs').readdirSync('data').filter(function(f){return /json$/.test(f)}).forEach(function(f){JSON.stringify(require('./data/'+f),function(k,v){if(/_kopecks$/.test(k)){n++;if(!Number.isInteger(v))bad++}return v})});console.log(n+' *_kopecks fields, non-integer: '+bad)"
# К3 — дата в HTML-рахунку
node bin/render-invoice.js INV-2026-00007 | grep -o 'Дата: <b>[^<]*'
# К4 — автентифікація (сервер на випадковому порту)
node -e "var h=require('http'),s=require('./server').createServer().listen(0,function(){var p=s.address().port,q=[['/invoices/INV-2026-00007',{}],['/api/invoices',{}],['/api/invoices',{'x-staff-id':'7'}]],n=0;q.forEach(function(r){h.get({port:p,path:r[0],headers:r[1]},function(res){res.resume();console.log(res.statusCode,r[0],JSON.stringify(r[1]));if(++n===q.length)s.close()})})})" 2>/dev/null
# К5 — нагадування на дату (для 04-01, 04-02, 04-03 — щоразу 27)
node -e "var r=require('./lib/notifications/reminders'),c={};require('./data/customers.json').forEach(function(x){c[x.id]=x});var m=r.buildReminders(require('./data/invoices.json'),c,'2026-04-01');console.log(m.length+' mails; '+m[0].text.split('\n')[2])"
# К6 — місячний звіт (лише stdout)
node bin/monthly-report.js 2026-03 | sed -n '4,9p'
# К7 — локальні форматери і крайові випадки
node -e "var f=require('./lib/format');console.log(require('./lib/customers/index').fmtAmount(123450),require('./lib/catalog/price-import').fmtAmount(9550),JSON.stringify(f.formatText('ТОВ «А»;\r\nфілія  2')),f.formatDate('2026-02-30'))"
```

**Підсумок:** 18 тверджень — 7 ✅, 11 ❌.
- 8 із 11 ❌ — з `ARCHITECTURE.md` (2019): з його технічних тверджень правдиві лише «гроші — копійки» і
  половина № 6 (дати *зберігаються* в ISO).
- 3 ❌ — з коментарів у коді (№ 12–14): коментарі теж брешуть.
- `oblik-plus.md` (2021) збігається з кодом (№ 10–11).

## 4. Висновок

**Де агент помилився:**
- **Граф імпортів.** Перший скрипт «хто імпортує» назвав `routes.js` та `index.js` мертвими, бо не бачив
  `require('./index')`, `require('../invoices')` і `require(m)`. Помилку виправлено точним grep до того, як
  вона потрапила в карту.
- **Повторна перевірка знайшла:**
  - приклади, узяті з коментарів замість запуску;
  - надто сильні твердження (часовий пояс, «динамічний імпорт», «звіти без `грн`»);
  - пропущене: 2 колекції, щоденні нагадування, мовчазне зникнення маршрутів, відсутність тестів на CSV.
- **Пошук за літералом.** `grep "03/09/2026" test` не знайшов тест, бо в регулярному виразі слеші
  екрановані (`03\/09\/2026`).

**Чому перевірено найризикованіше:**
- **Стара документація й коментарі (№ 1–15).** Те, що переказано зі старого документа, звучить
  найупевненіше й застаріває першим.
- **Контракт з «Облік-Плюс» (№ 10–11, 16).** Хибний ✅ тут коштує найдорожче: за `oblik-plus.md:29-35` у
  2021 році система мовчки пропустила 40 рахунків. Тому ці пункти перевірено **запуском** (К1), а не читанням.
- **Не перевірено**, бо в репо цього немає: розклад cron, хто й коли забирає CSV, поведінка «Облік-Плюс».
  Для BILL-482 вважаємо контракт чинним.

**Обмеження:**
- Перша перевірка — самоперевірка; тому кожне твердження має команду для повторного запуску.
- Повторна перевірка зменшує ризик пропусків, але не виключає його: вона спиралася на ті самі методи — пошук і запуск коду.
- Файли курсу заздалегідь попередили агента про застарілу документацію й прихованого споживача.
