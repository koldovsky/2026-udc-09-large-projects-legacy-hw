# Карта кодової бази — `app/`

> Task A. Карту склав агент (Claude Code), потім кожне ризиковане твердження
> перевірено по коду. Рядки нижче — з версії репо на коміті `7ada5a0`.

## 1. Як агент будував карту

- Інструмент / модель: Claude Code (десктоп), Sonnet 5.5.
- Промпт (стисло): «let's do task a» — агент сам прочитав `AGENTS.md` і
  `docs/walkthrough.md` і зрозумів завдання: карта `app/` — точки входу, модулі,
  дані, інтеграції, де форматуються дати й гроші.
- Вартість навігації: ~28 викликів інструментів. Прочитано повністю або частково
  ~20 файлів (4 курсові, 16 із `app/`: `docs/ARCHITECTURE.md`,
  `docs/integrations/oblik-plus.md`, `server.js`, `package.json`, `lib/format.js`,
  `lib/store.js`, `lib/export/accounting.js`, `lib/invoices/render.js`,
  `lib/notifications/reminders.js`, `bin/nightly-export.js`, голови `legacy/*`,
  `router.js`, `reports/render.js`, `bin/*`). Лічильника токенів у цьому
  інтерфейсі агент не бачить, тож **кількість токенів не виміряно** — не вигадую.
- Читав усе підряд чи шукав? **Шукав.** З 86 файлів `app/` відкрито менше чверті.
  Порядок: структура (`Glob`) → документація → точки входу → один `grep` за
  `formatDate|format|toISOString|…` по всьому `app/` → читання тільки тих файлів,
  які grep показав споживачами. Модулі `catalog`, `customers`, `orders`,
  `payments` вивчені лише за іменами файлів, списком маршрутів і `grep`, а не
  читанням — у карті вони позначені відповідно.

## 2. Карта (те, що видав агент, з правками після перевірки)

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP, порт 8080 (`npm start`) | Власний роутер на `http`, 7 модулів маршрутів + `/health` = 26 маршрутів | `server.js`, `lib/http/router.js` |
| cron 02:30 (`npm run export`) | Нічний CSV для бухгалтерії → `out/export/oblik-YYYY-MM-DD.csv` | `bin/nightly-export.js` |
| cron 09:00 (`npm run reminders`) | Листи-нагадування → файли в `out/mail/` (SMTP-релей забирає їх сам) | `bin/send-reminders.js` |
| cron 07:00 1-го числа | Місячний звіт у stdout (пошта директору й бухгалтерії) | `bin/monthly-report.js` |
| CLI | HTML рахунку в stdout | `bin/render-invoice.js` |
| CLI, вручну | Імпорт банківської виписки (dry-run за замовчуванням, `--apply` пише) | `bin/import-statement.js` |
| одноразові, **не запускати** | Виправлення дублікатів клієнтів 2022; міграція Mongo → JSON 2020 | `bin/fix-2022-duplicate-customers.js`, `lib/legacy/mongo-migrate.js` |

Самого crontab-а в репо немає (у коментарях згадано `ops/crontab` на старому
сервері) — розклад відомий лише з коментарів.

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/format.js` | Спільні форматери: дата, гроші для людей / для машин, текст, відсоток | живий, **спільний для людей і машин** |
| `lib/store.js` | JSON-«база» у `data/*.json`, кеш у пам'яті, колбеки | живий |
| `lib/http/router.js` | Мінімальний роутер (`:param`) | живий |
| `lib/invoices/` | Виставлення рахунків, нумерація, ПДВ, строк оплати; `render.js` — HTML рахунку | живий |
| `lib/notifications/reminders.js` | Побудова листів-нагадувань (чиста функція) | живий |
| `lib/export/accounting.js` | CSV для «Облік-Плюс», колонки з `config/export-columns.json` | живий |
| `lib/reports/` | Звіти: виручка, старіння боргу, топ-клієнтів, ПДВ; текст і JSON; власні дати (`dates.js`) | живий |
| `lib/customers/`, `lib/orders/`, `lib/catalog/`, `lib/payments/` | Клієнти, замовлення, каталог і склад, оплати та виписка | живі (маршрути підключені; вглиб не читано) |
| `lib/audit/` | Журнал змін (`out/audit.log`), ретеншн, `GET /api/audit` | живий лише маршрут читання; `audit.record` у `lib/` і `bin/` ніхто не викликає (`grep`) |
| `lib/discounts/` | Лояльнісні знижки за `config/features.json` | **мертвий**: прапор `loyaltyDiscounts: false`, `require` лише в тестах |
| `lib/legacy/templates.js`, `pdf-client.js` | Hbs-компілятор і клієнт PDF-сервісу, вимкненого 2020 | **мертві**: `templates/` немає, `require` лише з тестів |
| `lib/legacy/mongo-migrate.js` | Одноразова міграція 2020 | мертвий (довідковий) |

### Дані

`app/data/*.json` — файл на колекцію (customers, orders, invoices, payments,
products, stock, price_history), кеш у пам'яті, запис через `store.save`. Дати
зберігаються як рядки `YYYY-MM-DD`, гроші — цілі копійки (`lib/store.js:9`).
Банківська виписка — фіксована ширина KB-2 (`data/statements/`). Усе, що
пише застосунок, лягає в `app/out/` (у `.gitignore`).

### Зовнішні інтеграції

- **Клієнти (люди):** HTML рахунку за `GET /invoices/:number` і листи
  `out/mail/*.txt`. Обидва показують дату через `format.formatDate`.
- **«Облік-Плюс» (система):** нічний CSV, `;`, CRLF, дата **`MM/DD/YYYY`**, суми
  `1234.50`. Рядок із датою в іншому форматі вони **мовчки пропускають**
  (`app/docs/integrations/oblik-plus.md`).
- **Директор / бухгалтерія:** місячний звіт у stdout; BI-таблиця Олени тягне
  JSON зі звітів.
- **SMTP-релей:** підхоплює файли з `out/mail/`.
- **Банк:** файл виписки KB-2, імпорт вручну.

### Де форматуються дати й гроші

- **Єдиний форматер дати для відображення:** `lib/format.js:29` `formatDate`.
  Реально повертає `MM/DD/YYYY`, хоча JSDoc там каже «ISO».
- **Прямі виклики:** `lib/invoices/render.js:38-39` (рахунок),
  `lib/notifications/reminders.js:40,46` (листи).
- **Прихований виклик:** `lib/export/accounting.js:30` —
  `format['format' + col.type]` для колонок `type: "Date"` у
  `config/export-columns.json`. Пошук за іменем `formatDate` цього не покаже.
- Звіти (`lib/reports/dates.js`) і решта модулів `formatDate` не використовують:
  ISO-рядки напряму, `monthName` для заголовків.
- **Гроші:** `formatMoney` (для людей, `1 234,50 грн`), `formatDecimal` (для
  машин, `1234.50`).

## 3. Перевірка — щонайменше 10 тверджень

Перші вісім — з `app/docs/ARCHITECTURE.md` (травень 2019): їх агент найімовірніше
міг узяти зі старої документації, тому перевірялись насамперед вони.

| # | Твердження з карти / з документації | ✅ / ❌ | Доказ |
|---|---|---|---|
| 1 | «Billing — Express-застосунок» (ARCHITECTURE.md:7) | ❌ | `lib/http/router.js:4-5`: «We had Express until 2020»; `server.js:5-6` — `http` + власний `Router`; у `package.json` немає залежностей |
| 2 | «Дані лежать у MongoDB» (ARCHITECTURE.md:8) | ❌ | `lib/store.js:3-9` — JSON-файли в `data/`; Mongo лише в одноразовому `lib/legacy/mongo-migrate.js:3` |
| 3 | «Сторінки й документи рендеряться з `templates/` (Handlebars)» | ❌ | `lib/invoices/render.js:4-6`: рендер — рядки в коді; `ls app/templates` → «No such file»; `legacy/templates.js:14`: «templates/ was removed (2020)» |
| 4 | «Форматування для людей — лише в шаблонах» (ARCHITECTURE.md:28) | ❌ | `lib/invoices/render.js:38-39` і `lib/notifications/reminders.js:40,46` викликають `format.formatDate` із коду |
| 5 | «Експорт для бухгалтерії — `lib/export/csv.js`», «бухгалтерія забирає CSV вручну», «інтеграції: тільки SMTP» | ❌ | файл називається `lib/export/accounting.js`; `csv.js` немає; `bin/nightly-export.js:2-4` — cron, а `docs/integrations/oblik-plus.md:5-6` — забирають автоматично о 06:00 |
| 6 | «`lib/mail` — SMTP» | ❌ | теки `lib/mail` немає (`Glob`); `bin/send-reminders.js:2-3,22-25` пише `.txt` у `out/mail/`, SMTP лише в коментарі |
| 7 | «`npm start` → порт 3000, Node 8+ і MongoDB 3.6» | ❌ | `config/default.json`: порт 8080; `server.js:2`; `package.json:13-15`: `node >=22` |
| 8 | «Усі дати зберігаються й передаються в ISO 8601» | ✅ для зберігання, ❌ для виходу | зберігання: `data/invoices.json` → `"issued_at": "2026-03-01"`, `lib/store.js:9`. Вихід: `format.js:33` дає `MM/DD/YYYY`, а JSDoc (`format.js:27`) стверджує «ISO» — коментар бреше |
| 9 | `formatDate` читає не лише людина: колонки `Date` в нічному CSV теж ідуть через неї | ✅ | `lib/export/accounting.js:30` (`format['format' + col.type]`), `config/export-columns.json`: `issued_at`, `due_at` типу `Date`; `docs/integrations/oblik-plus.md:23` — «Облік-Плюс» очікує `MM/DD/YYYY` |
| 10 | Звіти не залежать від `formatDate` | ✅ | `grep -rn formatDate lib` → лише `format.js`, `render.js`, `reminders.js`; `lib/reports/*` не імпортує `../format`, дати — `dates.js:25` (ISO) |
| 11 | `lib/discounts` — живий модуль | ❌ мертвий | `grep -rl discounts lib bin server.js` → лише сам модуль; `config/features.json`: `loyaltyDiscounts: false`; `require` тільки з `test/discounts/` |
| 12 | `lib/legacy/pdf-client.js` і `templates.js` — мертві | ✅ | `grep "legacy/"` → лише `test/legacy/templates.test.js`; `pdf-client.js:7-9` — сервіс вимкнено 2020 |
| 13 | У системі 26 HTTP-маршрутів (README) | ✅ | `grep -c "method:" lib/*/routes.js` → 25 записів у модулях + `/health` у `server.js:29` |
| 14 | Засіяний набір — 106 зелених тестів (README) | ✅ | `cd app && npm test` → `pass 106`, `fail 0` |
| 15 | Журнал змін (`audit`) наповнюється системою | ❌ (не знайдено записувача) | у `lib/` і `bin/` немає викликів `audit.record`; `lib/audit/index.js:5` описує журнал, `routes.js` лише читає. Перевірено `grep`, не виконанням — можливий виклик через інший псевдонім |

## 4. Висновок

**Де агент (за документацією) помилився б.** `app/docs/ARCHITECTURE.md` у п'яти
місцях суперечить коду: Express, MongoDB, Handlebars-шаблони, `lib/mail` і
«форматування лише в шаблонах» (пп. 1–7). Агент, який би взяв карту з цього
документа, описав би систему, якої вже немає. Тут карту складено з коду, тому
ці помилки відловлено, але вони ж — головна пастка для наступного агента.

**Найризикованіша знахідка для тікета.** П. 8–9: функція `formatDate` обслуговує
одночасно людей (рахунок, листи) і машину («Облік-Плюс»), причому в нічний CSV
вона потрапляє через динамічний пошук `'format' + col.type`, який не знайти
пошуком за іменем. Саме той файл, який мовчки ламається при зміні формату
(`oblik-plus.md:29-35`). Зміна `formatDate` для тікета BILL-482 зламала б експорт.
Це передусім матеріал для Task B.

**Що перевірено слабше.** Модулі `customers`, `orders`, `catalog`, `payments`
вивчено лише за іменами, маршрутами і `grep` — я не читав їхній код. Позначка
«живий» там означає «підключений у `server.js`», а не «перевірена логіка».
Твердження про `audit` (п. 15) не підтверджене виконанням. Токени не виміряно.
