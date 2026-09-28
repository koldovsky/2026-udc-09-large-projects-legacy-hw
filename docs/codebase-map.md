# Карта кодової бази — `app/`

> Task A. Згенеруйте карту агентом, потім **перевірте її** — друга частина
> важливіша за першу. Скопіюйте цей файл у `docs/codebase-map.md`.

## 1. Як агент будував карту

- Інструмент / модель: Claude Opus 4.6 через Claude Code CLI + JetBrains MCP
- Промпт (стисло): «Склади карту app/: точки входу (HTTP, cron, CLI), модулі і що вони роблять, як зберігаються дані, які є зовнішні інтеграції, де форматуються дати й гроші»
- Вартість навігації: прочитано ~30 файлів, ~40 tool calls (read_file, search_text, search_regex, list_directory_tree). Загалом ≈25 000 input-токенів на навігацію
- Він прочитав усе підряд чи шукав? Спершу побудував дерево каталогів (`list_directory_tree`), потім цілеспрямовано читав ключові файли (`server.js`, `format.js`, `store.js`, routes-файли, bin/-скрипти). Потім шукав `formatDate` через `search_text` і `search_regex`. Не читав кожен файл — орієнтувався на import-ланцюжки і grep за ключовими іменами.

## 2. Карта (те, що видав агент, з моїми правками)

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP-сервер | `npm start` → порт 8080, реєструє маршрути з 7 модулів | `app/server.js` |
| Cron: нічний експорт | `bin/nightly-export.js` — генерує CSV для «Облік-Плюс», cron 02:30 | `app/bin/nightly-export.js` |
| Cron: нагадування | `bin/send-reminders.js` — будує листи-нагадування, cron 09:00 в робочі дні | `app/bin/send-reminders.js` |
| Cron: місячний звіт | `bin/monthly-report.js` — текстовий/JSON звіт для директора, cron 07:00 1-го числа | `app/bin/monthly-report.js` |
| CLI: рендер рахунку | `bin/render-invoice.js INV-XXXX` — виводить HTML-рахунок у stdout | `app/bin/render-invoice.js` |
| CLI: імпорт виписки | `bin/import-statement.js` — імпортує банківську виписку формату KB-2 | `app/bin/import-statement.js` |
| CLI: одноразовий фікс | `bin/fix-2022-duplicate-customers.js` — дедуплікація клієнтів (legacy, 2022) | `app/bin/fix-2022-duplicate-customers.js` |

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/invoices/` | Виставлення рахунків, розрахунок ПДВ, номери, рендер HTML | Живий |
| `lib/customers/` | CRUD клієнтів, валідація ЄДРПОУ, пошук | Живий |
| `lib/orders/` | Замовлення, статусна модель, створення | Живий |
| `lib/payments/` | Оплати, імпорт KB-2 виписок, зіставлення з рахунками | Живий |
| `lib/catalog/` | Продукти, SKU, прайси, імпорт цін, залишки | Живий |
| `lib/reports/` | Звіти: виручка, aging дебіторки, топ-клієнти, ПДВ; текстовий і JSON рендер | Живий |
| `lib/audit/` | Журнал змін, read-only API | Живий |
| `lib/notifications/` | Нагадування (upcoming/overdue) | Живий |
| `lib/export/` | CSV-експорт для бухгалтерії «Облік-Плюс» | Живий |
| `lib/discounts/` | Знижки та лояльність (feature flag `loyaltyDiscounts: false`) | Частково мертвий — лояльність вимкнена |
| `lib/legacy/` | Міграційні хелпери, старі пачки | Мертвий / рідко використовується |
| `lib/http/` | Мінімальний роутер (`router.js`), замінив Express у 2020 | Живий (інфраструктура) |
| `lib/format.js` | Форматування дат (`MM/DD/YYYY`), грошей (копійки → `грн`), десяткових, тексту, відсотків | Живий — ключовий для тікета |
| `lib/store.js` | JSON-"база даних": lazy load з `data/*.json`, кеш у пам'яті | Живий (інфраструктура) |

### Дані

- **Сховище:** JSON-файли в `app/data/` (customers.json, invoices.json, orders.json, payments.json, products.json, price_history.json, stock.json)
- **Формат дат:** YYYY-MM-DD строки (ISO 8601), зберігаються в JSON as-is
- **Формат грошей:** цілі копійки (integer), ніколи float
- **Завантаження:** `lib/store.js` — lazy read з кешем у пам'яті; callback API
- **Банківські виписки:** `app/data/statements/` — файли формату KB-2 для імпорту оплат

### Зовнішні інтеграції

| Інтеграція | Споживач | Формат | Файл |
|---|---|---|---|
| «Облік-Плюс» (бухгалтерія) | Зовнішній сервер забирає CSV о 06:00 | CSV: `;`-separated, CRLF, дати `MM/DD/YYYY`, суми `1234.50` | `lib/export/accounting.js`, `config/export-columns.json` |
| SMTP-relay (нагадування) | Старий SMTP-relay забирає .txt з outbox | Plain text листи | `lib/notifications/reminders.js`, `bin/send-reminders.js` |
| Банківська виписка KB-2 | Імпорт з банку → оплати | Текстовий формат KB-2 | `lib/payments/kb2.js`, `bin/import-statement.js` |
| BI-таблиця Олени | Олена тягне JSON щопонеділка | JSON через HTTP API `/api/reports/*` | `lib/reports/routes.js` |

### Де форматуються дати і гроші

| Функція | Що робить | Хто використовує |
|---|---|---|
| `formatDate(value)` | `YYYY-MM-DD` → `MM/DD/YYYY` | `invoices/render.js` (HTML), `notifications/reminders.js` (листи), `export/accounting.js` (CSV — **динамічно** через `format['format' + col.type]`) |
| `formatMoney(kopecks)` | Копійки → `1 234,50 грн` | `invoices/render.js`, `notifications/reminders.js` |
| `formatDecimal(kopecks)` | Копійки → `1234.50` | `export/accounting.js` (CSV суми) |
| `formatText(value)` | Очищення тексту для CSV | `export/accounting.js` |
| `formatPercent(value)` | `20` → `20%` | `invoices/render.js` |
| `reports/dates.js` | Окремий набір: monthName, daysBetween, ISO-валідація | Тільки `lib/reports/` — **не** через `format.js` |
| `reports/table.js:fmtAmount` | Суми для текстових звітів | `lib/reports/render.js` |

## 3. Перевірка — щонайменше 10 тверджень

| # | Твердження з карти | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | ARCHITECTURE.md каже «Express-застосунок» | ❌ Застаріло | `lib/http/router.js:7` — коментар: «We had Express until 2020; it was removed when the security audit flagged the dependency tree» |
| 2 | ARCHITECTURE.md каже «MongoDB» | ❌ Застаріло | `lib/store.js` — увесь модуль працює з JSON-файлами, жодного згадування MongoDB |
| 3 | ARCHITECTURE.md каже «шаблонами Handlebars, templates/» | ❌ Застаріло | `lib/invoices/render.js:5` — коментар: «templates/ was dropped in 2020 when the PDF service went away»; каталог `templates/` не існує |
| 4 | ARCHITECTURE.md каже «порт 3000» | ❌ Застаріло | `config/default.json:8` — `"port": 8080` |
| 5 | ARCHITECTURE.md каже «Node 8+» | ❌ Застаріло | `package.json:11` — `"node": ">=22"` |
| 6 | ARCHITECTURE.md каже «npm install» потрібен | ❌ Застаріло | `package.json` не має жодної залежності; `node_modules` не потрібен |
| 7 | ARCHITECTURE.md каже «lib/mail — SMTP» | ❌ Неточно | Каталог `lib/mail` не існує; нагадування в `lib/notifications/reminders.js`; SMTP-relay забирає файли з outbox |
| 8 | ARCHITECTURE.md каже «Зовнішні інтеграції: тільки SMTP» | ❌ Неповно | Також є `export/accounting.js` → CSV для «Облік-Плюс» (бухгалтерія) — задокументовано в `docs/integrations/oblik-plus.md` |
| 9 | Карта: `formatDate` використовується в `export/accounting.js` через динамічний виклик | ✅ | `lib/export/accounting.js:30` — `format['format' + col.type]`; `config/export-columns.json:2-3` — `"type": "Date"` → викликає `format.formatDate` |
| 10 | Карта: дати зберігаються як YYYY-MM-DD | ✅ | `lib/store.js:9` — коментар «Dates are stored as YYYY-MM-DD strings»; `data/invoices.json` містить поля `issued_at: "2026-03-09"` тощо |
| 11 | Карта: гроші — цілі копійки | ✅ | `lib/format.js:39` — `formatMoney` ділить на 100 для грн; `lib/invoices/index.js:19-26` — `totals()` оперує `_kopecks` полями |
| 12 | Карта: «Облік-Плюс» вимагає дати в MM/DD/YYYY | ✅ | `docs/integrations/oblik-plus.md:23` — «Дата: MM/DD/YYYY — сервер «Облік-Плюс» стоїть з американською локаллю» |
| 13 | Карта: reports не використовують formatDate | ✅ | `lib/reports/render.js` — не імпортує `format.js`; `reports/dates.js` — свій набір хелперів; `grep -rn "require.*format" app/lib/reports/` — нуль результатів |

## 4. Висновок

Агент **не помилився** при побудові карти коду, бо читав безпосередньо вихідний код, а не документацію. Натомість `app/docs/ARCHITECTURE.md` містить **8 з 8 перевірених тверджень, що є застарілими** — це документ 2019 року, і з того часу систему повністю переписали з Express+MongoDB+Handlebars на plain Node.js HTTP + JSON-файли.

Найризикованішим для перевірки було твердження #9 — що `export/accounting.js` **динамічно** викликає `formatDate` через `format['format' + col.type]`. Цього не покаже звичайний `grep formatDate`, бо ім'я функції конструюється з рядка `'format' + 'Date'`. Саме це — прихований споживач, через якого бездумна зміна `formatDate` зламає експорт для бухгалтерії.
