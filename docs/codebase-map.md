# Карта кодової бази — `app/`

> Task A. Карта згенерована агентом, потім перевірена по коду.

## 1. Як агент будував карту

- Інструмент / модель: Claude Code, Opus 5.5 (`claude-opus-5-5`).
- Промпт (стисло): «Склади карту `app/`: точки входу (HTTP, cron, CLI), модулі
  й що вони роблять, як зберігаються дані, зовнішні інтеграції, де форматуються
  дати й гроші. Шукай, а не читай усе підряд; `app/docs/` читай останнім і
  познач, де вона розходиться з кодом».
- Вартість навігації: ~18 викликів Bash (`cat`/`sed -n`/`grep`/`node -e`) і
  1 Read; повністю прочитано 13 файлів (`README.md`, `package.json`, `server.js`,
  `lib/http/router.js`, `lib/format.js`, `lib/store.js`, `config/*.json`,
  `lib/export/accounting.js`, `lib/invoices/render.js`,
  `lib/notifications/reminders.js`, обидва файли `app/docs/`), шапки ще ~15
  (`bin/*`, `lib/legacy/*`, `lib/reports/dates.js`, `lib/audit/*`,
  `lib/payments/statement.js`), решту — лише через `grep`. З ~7,5 тис. рядків
  `app/` прочитано приблизно 1,5 тис. Лічильник сесії: ≈46 тис. токенів контексту.
- Він прочитав усе підряд чи шукав? Шукав. Почав з точок входу
  (`package.json` → `server.js` → `bin/*`), потім побудував граф `require(` одним
  `grep`, потім шукав форматування дат (`formatDate`, `getUTC*`, `toISOString`,
  `'/'`). Тести (`test/`) і більшість `lib/*/index.js` не читав.

## 2. Карта (те, що видав агент, з вашими правками)

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP `npm start`, порт 8080 | Самописний роутер замість Express. Модулі реєструють маршрути з `lib/<m>/routes.js`. `/api/*` вимагає заголовок `x-staff-id` | `server.js`, `lib/http/router.js` |
| HTTP `GET /invoices/:number` | HTML рахунку для клієнта, без `x-staff-id` | `lib/invoices/routes.js:63` |
| HTTP `/api/{invoices,customers,products,stock,orders,payments,reports,audit}` | JSON для бек-офісу (25 маршрутів) | `lib/*/routes.js` |
| cron 02:30 щоночі (`npm run export`) | CSV для «Облік-Плюс» → `out/export/oblik-YYYY-MM-DD.csv` | `bin/nightly-export.js` |
| cron 09:00 у робочі дні (`npm run reminders`) | Листи-нагадування → `out/mail/*.txt`, їх забирає SMTP-relay | `bin/send-reminders.js` |
| cron 07:00 1-го числа | Місячний звіт у stdout → пошта директору й бухгалтерії | `bin/monthly-report.js` |
| cron 03:10 | Ротація аудит-логу в `out/audit-archive/` | `lib/audit/retention.js` |
| CLI вручну (колись cron 07:00) | Імпорт банківської виписки KB-2 | `bin/import-statement.js` |
| CLI вручну | HTML рахунку в stdout | `bin/render-invoice.js` |
| CLI, одноразовий, **не запускати** | Злиття дублікатів клієнтів 2022 (BILL-317) | `bin/fix-2022-duplicate-customers.js` |
| CLI, одноразовий | Міграція MongoDB → `data/*.json` (2020) | `lib/legacy/mongo-migrate.js` |

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/format.js` | Спільні форматери: `formatDate` (зараз `MM/DD/YYYY`), `formatMoney` (`1 234,50 грн`), `formatDecimal` (`1234.50`), `formatText`, `formatPercent` | Живий, **спільний для людей і машин** |
| `lib/store.js` | JSON-«БД»: файл на колекцію в `data/`, кеш у пам'яті, колбеки | Живий |
| `lib/http/router.js` | Роутер, авторизація через `x-staff-id` | Живий |
| `lib/invoices/` | Виставлення рахунку із замовлення (`index.js`), HTML рахунку (`render.js`) | Живий |
| `lib/notifications/reminders.js` | Тексти нагадувань (за N днів до строку і після прострочення) | Живий (cron) |
| `lib/export/accounting.js` | CSV для «Облік-Плюс». Колонки й типи з `config/export-columns.json`, форматер викликається **за типом колонки** | Живий (cron) |
| `lib/customers/` | Клієнти, валідація ЄДРПОУ, пошук | Живий. `merge.js` має лише тести, з коду не викликається |
| `lib/orders/` | Замовлення, позиції, статуси | Живий |
| `lib/catalog/` | Товари, залишки, імпорт цін | Живий |
| `lib/payments/` | Парсер виписки KB-2, зіставлення оплат із рахунками | Живий |
| `lib/reports/` | Звіти (виручка, aging, топ клієнтів, ПДВ). **Свої** хелпери дат (`dates.js`) і грошей (`table.js`), `lib/format.js` не використовує | Живий |
| `lib/audit/` | Аудит-лог `out/audit.log` (JSON lines), читання через `/api/audit`, ротація | Частково: `audit.record()` ніхто, крім тестів, не викликає |
| `lib/discounts/` | Знижки лояльності за прапором `loyaltyDiscounts` | Мертвий: прапор `false`, модуль ніхто не імпортує |
| `lib/legacy/templates.js`, `pdf-client.js` | Міні-Handlebars і клієнт pdf-render. Має **власний** хелпер дат `dmy` → `дд.мм.рррр` | Мертвий: `templates/` немає, сервіс вимкнено 2020 |
| `lib/legacy/mongo-migrate.js` | Одноразова міграція | Мертвий (історичний) |
| `config/features.json` → `newAgingBuckets` | Прапор | Мертвий: не читається ніде |

### Дані

`data/*.json`: масиви об'єктів, по файлу на колекцію (customers, products,
orders, invoices, payments, price_history, stock), через `lib/store.js`. Дати
зберігаються рядками `YYYY-MM-DD`, гроші — цілими копійками (`*_kopecks`).
Виписки банку — fixed-width KB-2 у `data/statements/`, дати там `DDMMYYYY`, при
імпорті вони конвертуються в ISO (`lib/payments/statement.js:59`). Згенероване
(`out/export`, `out/mail`, `out/audit.log`) не комітиться.

### Зовнішні інтеграції

| Споживач | Що отримує | Формат дат / грошей | Хто читає |
|---|---|---|---|
| «Облік-Плюс» (бухгалтерія) | `out/export/oblik-*.csv`: `;`, CRLF, UTF-8, о 06:00 забирає сам | Дата `MM/DD/YYYY` (через `formatDate`, тип колонки `Date`), суми `1234.50` | **Машина.** Рядок з іншою датою мовчки пропускає (`app/docs/integrations/oblik-plus.md`) |
| SMTP-relay → клієнти | `out/mail/*.txt` | `formatDate` + `formatMoney` | Людина (клієнт) |
| Браузер клієнта | `GET /invoices/:number` (HTML) | `formatDate` + `formatMoney` | Людина (клієнт) |
| Пошта директора й бухгалтерії | stdout `bin/monthly-report.js` | Свої хелпери в `lib/reports` | Людина (внутрішня) |
| Банк (вхід) | Виписка KB-2 | `DDMMYYYY` | — (ми читаємо) |
| Адмінка, бек-офіс | JSON `/api/*` | ISO і копійки, без форматування | Програма / співробітник |

## 3. Перевірка — щонайменше 10 тверджень

Найризикованіші твердження — ті, що агент міг узяти з `app/docs/` (№ 1–5), і
ті, що визначають поле для BILL-482 (№ 6–10).

| # | Твердження з карти | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | Express і Handlebars не використовуються: роутер самописний, рендер рядками | ✅ (а `ARCHITECTURE.md:7` — ❌) | `lib/http/router.js:4` («We had Express until 2020»); `lib/invoices/render.js:4-5`; `package.json` без `dependencies`; `ls app/templates` → No such file |
| 2 | Дані в JSON-файлах `data/`, не в MongoDB | ✅ (`ARCHITECTURE.md:8` — ❌) | `lib/store.js:4,15`; `lib/legacy/mongo-migrate.js:3` (міграція 2020-11) |
| 3 | Порт 8080, Node 22+, `npm install` не потрібен | ✅ (`ARCHITECTURE.md:36,39` — ❌) | `config/default.json:7`; `server.js:39`; `package.json` → `"node": ">=22"` |
| 4 | Модулів `lib/export/csv.js` і `lib/mail` немає. Експорт — `lib/export/accounting.js`, пошта — файли в `out/mail` | ✅ (`ARCHITECTURE.md:22-23` — ❌) | `ls lib/export` → `accounting.js`; `bin/send-reminders.js:2-3,21-25` |
| 5 | Зовнішніх інтеграцій більше, ніж «тільки SMTP»: «Облік-Плюс» сам забирає CSV о 06:00, банк дає виписки | ✅ (`ARCHITECTURE.md:30` — ❌) | `bin/nightly-export.js:3-4`; `lib/payments/statement.js:2,14-20`; `app/docs/integrations/oblik-plus.md` |
| 6 | Форматування дат для людей не лише «в шаблонах»: `formatDate` повертає `MM/DD/YYYY`, хоча JSDoc каже «ISO format» | ✅ (JSDoc і `ARCHITECTURE.md:28` — ❌) | `lib/format.js:27` vs `lib/format.js:33`; `node -e 'console.log(require("./lib/format").formatDate("2026-03-09"))'` → `03/09/2026` |
| 7 | CSV «Облік-Плюс» залежить від `formatDate`, хоча ім'я функції в `accounting.js` не згадано | ✅ | `lib/export/accounting.js:30` (`format['format' + col.type]`); `config/export-columns.json:3-4` (`"type": "Date"`); `grep -rn formatDate lib bin` не знаходить `accounting.js` |
| 8 | Поточний CSV містить дати `MM/DD/YYYY` і суми з крапкою | ✅ | `node -e` із `buildAccountingFile` → `INV-2026-00001;03/01/2026;03/15/2026;…;4827.50;965.50;5793.00`; збігається з `oblik-plus.md:23-24` |
| 9 | Прямих викликів `formatDate` рівно 4: HTML рахунку (2) і нагадування (2) | ✅ | `grep -rn "formatDate" lib bin` → `lib/invoices/render.js:38,39`, `lib/notifications/reminders.js:40,46` |
| 10 | Звіти `lib/reports` і `lib/legacy/templates.js` не залежать від `lib/format.js` | ✅ | граф `require(`: `format` імпортують лише `invoices/render.js:7`, `export/accounting.js:9`, `notifications/reminders.js:4`; `lib/reports/dates.js:1-7`; `lib/legacy/templates.js:180-184` (`dmy`) |
| 11 | `lib/discounts`, `customers/merge.js`, `pdf-client.js` ніхто не імпортує | ✅ | `grep -rlE "require\([^)]*/(merge\|discounts\|pdf-client)'\)" lib bin server.js` → порожньо |
| 12 | Прапор `newAgingBuckets` ніде не читається | ✅ | `grep -rn newAgingBuckets lib bin test` → 0 рядків |
| 13 | Аудит пишуть самі модулі через `audit.record()` (так стверджує коментар у `lib/audit/routes.js:2-3`) | ❌ | `grep -rn "\.record(" lib bin server.js` поза `lib/audit/` → 0; викликає лише `test/audit/record.test.js` |
| 14 | `/api/*` без `x-staff-id` → 401; `/invoices/:number` відкритий | ✅ | `lib/http/router.js:100-101` |
| 15 | 106 засіяних тестів зелені | ✅ | `cd app && npm test` → `tests 106, pass 106, fail 0` |

## 4. Висновок

Помилки у фінальній карті не знайшлося, бо агент свідомо читав `app/docs/`
останнім і кожне твердження спершу шукав у коді. Ризиковані місця такі, і всі
вони перевірені:

- **`app/docs/ARCHITECTURE.md` (травень 2019) застарів майже повністю.**
  Express, Handlebars, MongoDB, порт 3000, `lib/export/csv.js`, `lib/mail`,
  «тільки SMTP» — у коді немає нічого з цього (№ 1–5). Агент, який починає з
  посилання в `app/README.md` («Архітектура: див. `docs/ARCHITECTURE.md`»),
  отримав би неправильну карту. Найнебезпечніша теза — «форматування для людей
  лише в шаблонах» (№ 6): з нею здається, що зміна `formatDate` нічого не
  зачепить.
- **Коментарі в коді теж брешуть.** JSDoc `formatDate` каже «ISO format», а
  повертає `MM/DD/YYYY` (№ 6). `audit/routes.js` стверджує, що модулі пишуть
  аудит, а викликів немає (№ 13).
- **Прихований споживач.** `accounting.js` вибирає форматер за рядком
  `'format' + col.type`, тому `grep formatDate` його не показує (№ 7–9). Саме цей
  вихід читає машина, а не людина, і `oblik-plus.md` прямо попереджає: після
  зміни формату рядки мовчки пропадають. Для BILL-482 це головний ризик: зміна
  в `formatDate` поламає CSV, хоча тестам формат CSV, найімовірніше, байдужий.
  Детально — у Task B.
- **Хибні кандидати.** У репо є ще дві реалізації дат — `lib/reports/dates.js`
  і `dmy` у `lib/legacy/templates.js` (останній уже дає `дд.мм.рррр`). Їх легко
  прийняти за «ту саму функцію» або спробувати перевикористати мертвий код.
  Перевірено, що від `lib/format.js` вони не залежать (№ 10).

Не перевірено: внутрішня логіка `orders`, `catalog`, `payments/matcher` і
`customers/validate` описана за шапками файлів, а для BILL-482 вона не важлива.
