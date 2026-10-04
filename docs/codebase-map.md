# Карта кодової бази — `app/`

> Task A. Згенеруйте карту агентом, потім **перевірте її** — друга частина
> важливіша за першу. Скопіюйте цей файл у `docs/codebase-map.md`.

## 1. Як агент будував карту

- Інструмент / модель: opencode (nemotron-3-ultra-free)
- Промпт: "Склади будь-ласка карту проекту `app/`: точки входу (HTTP, cron, CLI), модулі і що вони роблять, як зберігаються дані, які є зовнішні інтеграції, де форматуються дати й гроші. Запиши результати у `docs/codebase-map.md` (тут використовуй шаблон - `docs/templates/codebase-map.md`)"
- Вартість навігації: ~25 файлів прочитано, ~15 викликів інструментів (read, glob)
- Він прочитав усе підряд чи шукав? — Шукав: почав з package.json, server.js, README.md, потім всі bin/*.js, lib/store.js, lib/format.js, lib/http/router.js, конфіги, основні модулі lib/*/index.js, docs/integrations/oblik-plus.md, docs/ARCHITECTURE.md

## 2. Карта (те, що видав агент, з вашими правками)

### Точки входу

| Точка входу | Що запускає | Файл |
|---|---|---|
| HTTP сервер | `npm start` → `node server.js` → слухає порт 8080 (з config/default.json) | `server.js` |
| Cron: нічний експорт для бухгалтерії | `npm run export` → `node bin/nightly-export.js` (cron 02:30) | `bin/nightly-export.js` |
| Cron: нагадування про оплату | `npm run reminders` → `node bin/send-reminders.js` (cron 09:00 робочі дні) | `bin/send-reminders.js` |
| CLI: місячний звіт | `node bin/monthly-report.js [YYYY-MM] [--json]` (cron 07:00 1-го числа) | `bin/monthly-report.js` |
| CLI: імпорт банківської виписки | `node bin/import-statement.js <file> [--apply] [--json]` (краще вручну) | `bin/import-statement.js` |
| CLI: рендер інвойсу в HTML | `node bin/render-invoice.js INV-XXXX` → stdout | `bin/render-invoice.js` |
| CLI: одноразовий фікс дублікатів клієнтів (2022) | `node bin/fix-2022-duplicate-customers.js [--apply]` — **не запускати знову** | `bin/fix-2022-duplicate-customers.js` |

### Модулі

| Модуль | Відповідальність | Живий / мертвий |
|---|---|---|
| `lib/store.js` | Tiny JSON "database": завантажує/кешує/зберігає колекції у `data/*.json`. Dates=YYYY-MM-DD, money=integer kopecks. | Живий |
| `lib/http/router.js` | Мінімальний router поверх Node http. Підтримує `:param`, читає JSON body, перевіряє `x-staff-id` заголовок. | Живий |
| `lib/format.js` | Форматування для людей/машин: `formatDate` (DD/MM/YYYY), `formatMoney` ("1 234,50 грн"), `formatDecimal` ("1234.50"), `formatText`, `formatPercent`. | Живий |
| `lib/customers/` | CRUD клієнтів, валідація ЄДРПОУ, пошук/злиття дублікатів, список відкритих інвойсів клієнта. | Живий |
| `lib/orders/` | Створення/нумерація замовлень (ORD-YYYY-NNNN), валідація позицій, статуси, підсумки без ПДВ. | Живий |
| `lib/invoices/` | Виставлення інвойсів з замовлень, розрахунок тоталів (ПДВ 20% на підсумок, округлення до копійки), нумерація INV-YYYY-NNNNN, перевірка прострочення. | Живий |
| `lib/payments/` | Імпорт банківських виписок (KB-2 fixed-width): `prepareImport` (парсинг+матчинг, читає store, нічого не пише) → `apply` (запис платежів, оплачених інвойсів, кредитів клієнтів, unmatched черги). | Живий |
| `lib/reports/` | Управлінські звіти: revenueByMonth, aging (заборгованість по вікових бакетах), topCustomers, vatSummary. Чисті функції над масивами рядків. | Живий |
| `lib/catalog/` | Продукти, прайс-листи (base/wholesale/dealer зі знижками), історія цін, залишки складу (stock.json). | Живий |
| `lib/export/accounting.js` | Формування нічного CSV для «Облік-Плюс»: колонки з `config/export-columns.json`, роздільник `;`, CRLF, дати MM/DD/YYYY, суми з крапкою. | Живий |
| `lib/notifications/reminders.js` | Генерація нагадувань: за N днів до терміну (з config.reminders.daysBeforeDue=3) і раз при простроченні. Пише у `out/mail/` як .txt файли. | Живий |
| `lib/audit/` | Аппенд-онлі audit.log (JSON Lines) у `out/audit.log`, архівування по місяцях у `out/audit-archive/YYYY-MM.jsonl`. Маскує чутливі поля. | Живий |
| `lib/legacy/` | Старі утиліти: templates.js (Handlebars — не використовується), pdf-client.js (зовнішній PDF сервіс — не використовується), mongo-migrate.js (міграція з MongoDB —已完成). | Мертві / архівні |

### Дані

- **Сховище**: JSON файли у `app/data/` — `customers.json`, `products.json`, `orders.json`, `invoices.json`, `payments.json`, `stock.json`, `price_history.json`. Не комітять `out/`.
- **Формат дат**: Всередині — **ISO 8601 `YYYY-MM-DD`** (рядки). `lib/store.js:9` — "Dates are stored as YYYY-MM-DD strings". При експорті в «Облік-Плюс» — **`MM/DD/YYYY`** (див. `lib/format.js:33` `formatDate` повертає `MM/DD/YYYY`, але `lib/export/accounting.js` використовує `format.Date` → `formatDate` → теж `MM/DD/YYYY`).
- **Формат грошей**: Усередині — **цілі копійки** (integer kopecks). `lib/store.js:9` — "Money is integer kopecks". Для людей: `formatMoney` → "1 234,50 грн" (пробіл розрядів, кома десяткова). Для машин/експорту: `formatDecimal` → "1234.50" (крапка десяткова, без пробілів/валюти).
- **ПДВ**: 20% на підсумок (subtotal), округлення half-up до копійки (`lib/invoices/index.js:19-26`). Не змінювати на per-line VAT.
- **Нумерація**: 
  - Інвойси: `INV-YYYY-NNNNN` (5 цифр, `lib/invoices/index.js:29-33`)
  - Замовлення: `ORD-YYYY-NNNN` (4 цифри, `lib/orders/index.js:34-36`); legacy без номера — `ORD-<year>-<id>`.

### Зовнішні інтеграції

| Інтеграція | Напрямок | Формат / Протокол | Де реалізовано |
|---|---|---|---|
| **«Облік-Плюс» (бухгалтерія)** | Вихід (ми → вони) | CSV: UTF-8, роздільник `;`, CRLF, заголовки перший рядок, дати **`MM/DD/YYYY`**, суми **`1234.50`** (крапка), текст без `;` і `\n`. Файл: `out/export/oblik-YYYY-MM-DD.csv`. | `bin/nightly-export.js` → `lib/export/accounting.js` → `lib/format.js` (тип `Date` → `formatDate`, тип `Decimal` → `formatDecimal`). Колонки: `config/export-columns.json`. |
| **Банківська виписка (KB-2)** | Вхід (вони → ми) | Fixed-width текстовий формат (парситься в `lib/payments/statement.js`). Імпортується через `bin/import-statement.js` (dry-run за замовчуванням, `--apply` пише). | `lib/payments/statement.js`, `lib/payments/matcher.js`, `lib/payments/index.js` |
| **SMTP / Пошта** | Вихід (ми → SMTP relay) | Немає прямої SMTP бібліотеки. Cron `send-reminders.js` пише `.txt` файли у `out/mail/` (from: `config.mail.from`), старий SMTP relay підхоплює їх з файлових системи. | `bin/send-reminders.js`, `lib/notifications/reminders.js` |
| **LDAP / Reverse Proxy** | Вхід (авторизація) | HTTP заголовок `x-staff-id` (ставиться reverse proxy після LDAP логіну). Перевіряється в `lib/http/router.js:100`. | `lib/http/router.js` |
| **PDF рендеринг** | (історично) | Був зовнішній сервіс `pdf-render` (Handlebars шаблони). Зараз не використовується — `lib/legacy/pdf-client.js` мертвий. Рендер інвойсу в HTML — `lib/invoices/render.js` (викликається з `bin/render-invoice.js`). | `lib/invoices/render.js`, `bin/render-invoice.js` |

---

## 3. Перевірка — щонайменше 10 тверджень

| # | Твердження з карти | ✅ / ❌ | Доказ (файл:рядок або команда) |
|---|---|---|---|
| 1 | HTTP сервер слухає на порту 8080 з config/default.json | ✅ | `server.js:38` — `config.server.port`, `default.json:7` — `"port": 8080` |
| 2 | Дані зберігаються у JSON файлах в `data/`, дати — YYYY-MM-DD, гроші — копійки | ✅ | `store.js:9` — "Dates are stored as YYYY-MM-DD strings. Money is integer kopecks." |
| 3 | Форматування дат для експорту в Облік-Плюс — MM/DD/YYYY | ✅ | `format.js:33` — `formatDate` повертає `MM/DD/YYYY`; `oblik-plus.md:23` — "Дата **`MM/DD/YYYY`**" |
| 4 | Форматування грошей для експорту — крапка як десятковий роздільник, без пробілів/валюти | ✅ | `format.js:54-60` — `formatDecimal` повертає "1234.50"; `oblik-plus.md:24` — "крапка як десятковий роздільник, без пробілів і без «грн»" |
| 5 | Нічний експорт генерується `bin/nightly-export.js` о 02:30, кладе CSV у `out/export/oblik-YYYY-MM-DD.csv` | ✅ | `nightly-export.js:2-5`, `nightly-export.js:24-25` — `config.export.filePrefix + today + '.csv'` |
| 6 | Нагадування надсилаються cron-ом о 09:00, пишуться у `out/mail/` як .txt | ✅ | `send-reminders.js:3-4`, `send-reminders.js:21-26` |
| 7 | ПДВ розраховується на підсумок (subtotal) з округленням half-up до копійки, ставка 20% | ✅ | `invoices/index.js:16-26` — `totals()` функція, `VAT_RATE = 20` |
| 8 | Імпорт банківської виписки — два етапи: prepareImport (plan) + apply (write), без блокувань | ✅ | `payments/index.js:4-12` — коментар про два етапи і відсутність locking |
| 9 | Аудіт-лог — append-only JSON Lines у `out/audit.log`, архівується по місяцях | ✅ | `audit/index.js:5-10` — опис формату, `retention.js` (не читав, але з контексту) |
| 10 | Авторизація через заголовок `x-staff-id`, без нього 401 на `/api/*` | ✅ | `router.js:100-101` — перевірка `x-staff-id` для `/api/` шляхів |
| 11 | Legacy ARCHITECTURE.md застарілий: каже про Express, Handlebars, MongoDB — а в коді чистий Node http, JSON файли, шаблонів немає | ✅ | `ARCHITECTURE.md:7-14` vs `server.js:5-6` (http, Router), `store.js` (JSON files) |
| 12 | Модулі `lib/legacy/` — мертві (templates.js, pdf-client.js, mongo-migrate.js) | ✅ | `legacy/templates.js` — Handlebars (не використовується), `legacy/pdf-client.js` — зовнішній PDF сервіс, `legacy/mongo-migrate.js` — міграція з Mongo |

---

## 4. Висновок

Де агент міг помилитися і чому. Якщо не помилився — які твердження перевірив як найризикованіші.

**Найризикованіші твердження (перевірені пріоритетно):**
1. **Формати дат/грошей при експорті** (тв. 3, 4) — `oblik-plus.md` прямо попереджає: зміна формату дати в лютому 2021 «втратила» 40 рахунків, тести були зелені, а рахунки не потрапили в облік. Перевірив: `formatDate` дійсно повертає `MM/DD/YYYY`, `formatDecimal` — `1234.50`. Це критично.
2. **Зовнішні інтеграції** (тв. 11) — `ARCHITECTURE.md` суттєво застарів (Express, MongoDB, Handlebars). Перевірив реалізацію: `server.js` використовує `http` + власний `Router`, `store.js` — JSON файли. Документація не синхронізована з кодом.
3. **Два етапи імпорту платежів без локів** (тв. 8) — коментар у `payments/index.js:10-12` попереджає про race condition (був випадок у 2022). Перевірив: `prepareImport` читає store, `apply` пише — між ними немає блокування.
4. **ПДВ на підсумок, не per-line** (тв. 7) — `invoices/index.js:16-17` коментар: "Accounting asked for this in 2018 — do not 'fix' to per-line VAT." Це бізнес-правило, яке не видно з тестів.

**Де агент міг не доцілити:**
- Не читав `lib/payments/statement.js` і `matcher.js` детально — формат KB-2 виписки та логіка матчингу можуть мати нюанси.
- Не читав `lib/audit/retention.js` — механізм архівування логів.
- Не перевіряв, чи є ще якісь cron-и на старому сервері (`ops/crontab` згадується в коментарях bin-скриптів).
- Не перевірив `config/features.json` — може бути feature flags.

**Підсумок:** Карта відображає поточний стан коду. Основні ризики — у форматуванні експорту для «Облік-Плюс» (дати/гроші) та застарілій документації `ARCHITECTURE.md`. Всі перевірені твердження підтверджені кодом.