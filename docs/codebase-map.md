# Карта кодової бази — `app/`


## 1. Як агент будував карту

- **Інструмент / модель:** Claude Code (CLI), модель Claude Opus 5.5.
- **Промпт (стисло):**  дослідити вихідний код `app/`, визначити HTTP, cron і CLI точки входу, де зберігаються данні, зовнішні інтеграції, форматування, взаємодії між модулями.
- **Вартість навігації:**
  - ~14 викликів інструментів (13 Bash + 1 Read) до запису документа.
  - Файли: **повністю прочитано ~22** (`server.js`, `lib/http/router.js`, `lib/format.js`, `lib/store.js`, усі `bin/*.js`, `config/*.json`, `lib/export/accounting.js`, `lib/invoices/*`, `lib/notifications/reminders.js`, `lib/legacy/*`, `lib/reports/{dates,render,routes}.js`, `app/docs/*`). **Ще ~22 файли — лише заголовні коментарі** (перші ~30 рядків) і точкові `grep`. Тести не читалися, тільки граф їхніх `require`.
  - Токени: ≈100 тис. контексту на всю навігацію (за лічильником сесії). Точну цифру видає `/cost` у Claude Code.
- **Читав усе підряд чи шукав?** Комбінація. Спершу `wc -l` по всіх файлах, щоб побачити розмір, далі цілеспрямовано читалися точки входу та шлях «дата → вихід». Для решти модулів вистачало заголовних коментарів і графа `require` (`grep -rn "require("`). «Мертвий / живий» визначався пошуком того, хто імпортує модуль, а не коментарями. Для двох ключових тверджень запускався сам код (`node -e`).

## 2. Карта (те, що видав агент, з вашими правками)

**Загалом:** Node ≥22, CommonJS, колбеки, **0 npm-залежностей**. Express немає: власний роутер на `http`. Handlebars теж немає. MongoDB немає: «база» — JSON-файли в `data/`. 86 файлів, ~10 тис. рядків, 106 тестів (`node --test`).

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP `npm start` (порт 8080, `PORT` env) | `http.createServer` + `Router`. Модулі реєструють маршрути масивом `{method, path, handler}`. Без `x-staff-id` усе `/api/*` дає 401 | `server.js`, `lib/http/router.js` |
| HTTP — інвойси | `GET /api/invoices`, `GET /api/invoices/:id`, `POST /api/orders/:id/invoice`, **`GET /invoices/:number` (HTML для клієнта, без auth)** | `lib/invoices/routes.js` |
| HTTP — клієнти | `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`, `GET /api/customers/:id/invoices` | `lib/customers/routes.js` |
| HTTP — каталог | `GET /api/products`, `GET /api/products/:id`, `POST /api/products/price-import`, `GET /api/stock/low` | `lib/catalog/routes.js` |
| HTTP — замовлення | `GET/POST /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/status` | `lib/orders/routes.js` |
| HTTP — оплати | `GET /api/payments`, `POST /api/payments/import`, `GET /api/payments/unmatched` | `lib/payments/routes.js` |
| HTTP — звіти | `GET /api/reports/{revenue,aging,top-customers,vat}`, `?format=text` | `lib/reports/routes.js` |
| HTTP — аудит | `GET /api/audit` (лише читання) | `lib/audit/routes.js` |
| HTTP — `/health` | `{ok:true}` | `server.js:29` |
| cron 02:30 | Нічний CSV для «Облік-Плюс» → `out/export/oblik-YYYY-MM-DD.csv` | `bin/nightly-export.js` (`npm run export`) |
| cron 09:00 (робочі дні) | Нагадування про оплату → файли в `out/mail/`, звідти їх забирає SMTP-relay | `bin/send-reminders.js` (`npm run reminders`) |
| cron 07:00, 1-ше число | Місячний звіт у stdout, cron пересилає його поштою директору й бухгалтерії | `bin/monthly-report.js` |
| cron 03:10 | Ротація журналу аудиту в `out/audit-archive/` | `lib/audit/retention.js` |
| CLI (вручну; колись cron 07:00) | Імпорт банківської виписки KB-2, dry-run за замовчуванням | `bin/import-statement.js` |
| CLI | HTML рахунку в stdout | `bin/render-invoice.js` |
| CLI, **НЕ ЗАПУСКАТИ** | Разовий фікс дублікатів клієнтів 2022 (BILL-317) | `bin/fix-2022-duplicate-customers.js` |
| CLI, разовий 2020 | Міграція MongoDB → `data/*.json` | `lib/legacy/mongo-migrate.js` |

Разом **26 HTTP-маршрутів** (25 модульних + `/health`).

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/store.js` | JSON-«БД»: `all/find/where/insert/update/save`, кеш у пам'яті, запис на `save()` | Живий, ядро |
| `lib/format.js` | `formatDate` (**MM/DD/YYYY**), `formatMoney` (`1 234,50 грн`), `formatDecimal` (`1234.50`), `formatText`, `formatPercent` | Живий, **спільний для людей і машин** |
| `lib/http/router.js` | Роутер, `httpError`, `send` (JSON / HTML) | Живий |
| `lib/invoices/` | Виставлення з замовлення, ПДВ 20 % на суму, строк 14 днів, нумерація `INV-YYYY-NNNNN`; `render.js` — HTML рахунку | Живий |
| `lib/customers/` | CRUD, валідація ЄДРПОУ, пошук, деактивація замість видалення | Живий. `merge.js` (`planMerge`) викликають **лише тести** |
| `lib/catalog/` | Товари, залишки (`stock.js`), масове оновлення цін із файлу закупівлі (`price-import.js`) | Живий |
| `lib/orders/` | Замовлення, рядки, машина станів `new→confirmed→invoiced→shipped→closed` | Живий |
| `lib/payments/` | Парсер виписки KB-2 (`statement.js`), матчинг оплат (`matcher.js`), plan → apply | Живий |
| `lib/reports/` | Виручка, aging, топ-клієнти, ПДВ; власні `dates.js` і `table.js`. JSON + текстові таблиці | Живий |
| `lib/notifications/reminders.js` | Тексти нагадувань (upcoming / overdue) | Живий (через cron) |
| `lib/export/accounting.js` | CSV для «Облік-Плюс». Колонки з `config/export-columns.json`, рендерер клітинки — `format['format' + type]` | Живий (через cron), **тестів немає** |
| `lib/audit/` | Append-only журнал `out/audit.log`, читання, ротація | Наполовину: читання й ротація живі, але **`audit.record()` ніхто з модулів не викликає** |
| `lib/discounts/` | Знижки постійного клієнта, прапорець `loyaltyDiscounts` | **Мертвий**: жоден модуль його не імпортує (лише тести) |
| `lib/legacy/pdf-client.js`, `templates.js` | Клієнт `pdf-render` і міні-Handlebars | **Мертвий**: сервіс вимкнено 2020, `templates/` немає |
| `lib/legacy/mongo-migrate.js` | Разова міграція | Мертвий (історичний) |

### Дані

- `data/*.json`: `customers`, `products`, `orders`, `invoices`, `payments`, `stock`, `price_history`; приклад виписки — `data/statements/2026-03-sample.txt`. Відсутня колекція читається як `[]`.
- Запис: увесь файл перезаписується на `store.save(name)`. Блокувань немає, транзакцій немає.
- **Дати в даних:** рядки `YYYY-MM-DD` (наприклад `"issued_at": "2026-03-01"`). Аудит пише повний ISO timestamp. Банк дає `DDMMYYYY`, це перетворюється в ISO у `statement.js:59`.
- **Гроші:** цілі копійки скрізь (`*_kopecks`). Виняток — файл зміни цін від закупівлі (гривні з `,` або `.`).
- `out/` — згенеровані файли (export, mail, audit). У `.gitignore`, не комітити.

### Де форматуються дати й гроші

| Функція | Формат | Хто викликає | Хто читає |
|---|---|---|---|
| `format.formatDate` | `MM/DD/YYYY` | `invoices/render.js:38-39` (HTML рахунку), `notifications/reminders.js:40,46` (листи), **`export/accounting.js:30` — динамічно через `format['formatDate']`, тип `Date` у `export-columns.json`** | Клієнти (рахунок, лист) **і** «Облік-Плюс» (CSV) |
| `format.formatMoney` | `1 234,50 грн` | рахунок, нагадування | Клієнти |
| `format.formatDecimal` | `1234.50` | експорт (тип `Decimal`) | «Облік-Плюс» |
| `reports/dates.monthName` | `березень 2026` | звіти | Директор / бухгалтерія |
| звіти aging | сирий ISO `YYYY-MM-DD` (без `formatDate`) | `reports/render.js:45-46`, `as_of` | Люди + BI (JSON) |
| `reports/table.fmtAmount`, `customers/index.fmtAmount`, `catalog/price-import.fmtAmount`, `discounts.fmtAmount`, `bin/import-statement.fmtAmount`, `legacy/templates.dmy` | Локальні копії форматерів грошей і дат | — | Не залежать від `lib/format.js` |

### Зовнішні інтеграції

| Споживач / джерело | Канал | Формат | Чутливість |
|---|---|---|---|
| **«Облік-Плюс»** (бухгалтерія) | `out/export/oblik-*.csv` на шарі, забирає о 06:00 | UTF-8, `;`, CRLF, дата **`MM/DD/YYYY`**, сума `1234.50` | **Критично**: рядок із «неправильною» датою мовчки пропускається (`app/docs/integrations/oblik-plus.md`) |
| Клієнти (email) | `out/mail/*.txt` → SMTP-relay | Текст, дата через `formatDate` | Люди |
| Клієнти (рахунок) | `GET /invoices/:number`, `bin/render-invoice.js` | HTML, дата через `formatDate` | Люди |
| Банк «Вигаданий» (вхід) | `bin/import-statement.js`, `POST /api/payments/import` | KB-2 fixed-width, дата `DDMMYYYY` | Вхід, від `formatDate` не залежить |
| BI-таблиця (Олена, щопонеділка) | `/api/reports/*` JSON | ISO-дати, копійки | Машина |
| Директор / бухгалтерія | `bin/monthly-report.js` stdout → mail | Текстові таблиці | Люди |
| ~~pdf-render~~ | ~~HTTP~~ | — | Вимкнено 2020, код мертвий |

## 3. Перевірка — щонайменше 10 тверджень

Пріоритет перевірки — твердження зі старої документації (`app/docs/ARCHITECTURE.md`, 2019) і з коментарів у коді. Саме з них агент найімовірніше переписав би неправду в карту.

| #  | Твердження | ✅ / ❌ | Доказ (файл:рядок або команда) |
|----|---|---|---|
| 1  | *(ARCHITECTURE.md:7-8)* «Сторінки й документи рендеряться з `templates/*.hbs`» | ❌ | `ls app/templates` → `No such file or directory`. `lib/invoices/render.js:4-5`: «templates/ … dropped in 2020 … the string building below is what actually runs» |
| 2  | *(ARCHITECTURE.md:8)* «Дані лежать у MongoDB» | ❌ | `lib/store.js:1-4`: JSON-файли в `data/`. Mongo згадується лише в разовому `lib/legacy/mongo-migrate.js:3` (2020-11) |
| 3  | Гроші — цілі копійки *(ARCHITECTURE.md:29, `store.js:9`)* | ✅ | `lib/invoices/index.js:19-25` рахує в копійках з `Math.round`. Поля `*_kopecks` у `data/invoices.json`. `format.js:38` «never floats» |
| 4  | Дати в даних зберігаються як `YYYY-MM-DD` | ✅ | `grep -o '"issued_at": "[^"]*"' data/invoices.json` → `"2026-03-01"`. Банківські `DDMMYYYY` конвертуються в `lib/payments/statement.js:58-59` |
| 5  | На CSV-експорт немає жодного тесту | ✅ | `grep -rn "accounting\|export" test` → порожньо. Зміна формату дати не зробить червоним жоден тест (саме сценарій інциденту 2021, `oblik-plus.md:33-35`) |
| 6  | *(`lib/audit/routes.js:2-3`)* «entries are written by the modules themselves through `audit.record()`» | ❌ | `grep -rn "audit.record\|\.record(" lib bin` поза `lib/audit/index.js` знаходить лише цей коментар. Жоден модуль не пише в аудит, хоча `GET /api/audit` існує |
| 7  | `lib/discounts` нікуди не підключений, прапорець ні на що не впливає | ✅ | `grep -rn "require(.*discounts" lib bin server.js` → порожньо. `lib/discounts/index.js:7-9`. `config/features.json:2` `"loyaltyDiscounts": false` |
| 8  | `lib/legacy/pdf-client.js` мертвий | ✅ | Жоден `require('…legacy/pdf-client')` у `lib`, `bin`, `server.js`, `test`. Тести імпортують лише `legacy/templates` |
| 9  | `bin/import-statement.js` запускається з cron о 07:00 | ❌ (застаріло) | `bin/import-statement.js:8-10`: «Switched to manual … nobody turned cron back on» |
| 10 | `npm test` — 106 зелених | ✅ | `cd app && npm test` → `tests 106, pass 106, fail 0` |

## 4. Висновок

**Де карта могла помилитися і чому.** Найризикованіше джерело — `app/docs/ARCHITECTURE.md` (травень 2019). Його твердження про шаблони й MongoDB хибні (№ 1, 2). Агент не переніс їх у карту, бо будував її з коду (`server.js`, граф `require`, `ls`), а документацію використовував лише як список гіпотез для перевірки. Друге джерело помилок — коментарі в самому коді: `audit/routes.js` «modules write through audit.record()» (№ 6) і cron о 07:00 для імпорту виписки (№ 9). Обидва спростовано `grep` і самим кодом.

**Чому саме ці твердження.** Твердження відбиралися за чотирма критеріями. Кожне з 10 потрапило в таблицю хоча б за одним із них.

1. **Застаріле джерело.** Твердження з `ARCHITECTURE.md` і коментарів у коді найімовірніше хибні. Це не припущення, а встановлений факт: документ датований травнем 2019 (`ARCHITECTURE.md:3`), а код прямо фіксує пізніші зміни. Шаблони прибрали у 2020 (`invoices/render.js:4-5`), з Mongo переїхали у 2020-11 (`mongo-migrate.js:3`). Сюди належать № 1, 2, 3 (документація) та № 6, 9 (коментарі). Результат підтвердив критерій: чотири з п'яти хибні. Водночас № 3 теж узятий з документації, і він правдивий. Тож документацію не можна просто відкинути, її треба саме перевіряти.

