# AGENTS.md — неочевидне знання про цю кодову базу

> Прочитай це **до** першої зміни. Це те, що я (агент) дізнався за умовою — щоб ти не потрапив у ці пастки.

---

## 1. Зовнішні контракти (не змінювати без узгодження)

| Система | Файл | Формат | Критично |
|---|---|---|---|
| **Облік-Плюс** (бухгалтерія) | `lib/export/accounting.js` → `config/export-columns.json` | CSV: `;` separator, CRLF, дати **`MM/DD/YYYY`**, суми **`1234.50`** (крапка, без пробілів/грн) | **Так** — лютий 2021: зміна дати → 40 рахунків не потрапили в облік, тести були зелені. Див. `docs/integrations/oblik-plus.md:23-35` |
| **Банківська виписка** (KB-2) | `lib/payments/statement.js` | Fixed-width текст | Парситься в `prepareImport`, матчиться в `matcher.js` |
| **SMTP relay** | `bin/send-reminders.js` | Пише `.txt` у `out/mail/` — старий relay підхоплює з файловики | Немає SMTP бібліотеки в коді |
| **LDAP / Reverse Proxy** | `lib/http/router.js:100` | HTTP заголовок `x-staff-id` (ставиться проксі після LDAP) | Без нього 401 на `/api/*` |

---

## 2. Пастки форматування дат (3 незалежні функції!)

| Функція | Файл | Формат | Хто читає |
|---|---|---|---|
| `formatDate` | `lib/format.js:29` | **`MM/DD/YYYY`** | Облік-Плюс (CSV export) — **НЕ ЗМІНЮВАТИ** |
| `formatDateClient` | `lib/format.js:45` | **`DD.MM.YYYY`** | HTML інвойси (`lib/invoices/render.js`), емейл-нагадування (`lib/notifications/reminders.js`) |
| `dmy()` (Handlebars хелпер `'date'`) | `lib/legacy/templates.js:180` | **`DD.MM.YYYY`** | Legacy PDF/HTML (шаблони видалені 2020, хелпер залишився) |

> `grep "formatDate"` **не знайде** `dmy()` і динамічні виклики `format['format' + col.type]`. Шукай імпорти `require('../format')`.

---

## 3. Пастки форматування грошей

| Функція | Файл | Формат | Де використовується |
|---|---|---|---|
| `formatMoney` | `lib/format.js:40` | `"1 234,50 грн"` (пробіл тисяч, кома, валюта) | HTML інвойси, емейли, клієнтський UI |
| `formatDecimal` | `lib/format.js:67-73` | `"1234.50"` (крапка, без пробілів/валюти) | CSV для Облік-Плюс (`type: "Decimal"`) |
| `fmtAmount` | `lib/reports/table.js` | `"12 345,67"` (пробіл тисяч, кома, **без валюти**) | Текстові звіти (`lib/reports/render.js`) — **окрема функція!** |

> Не припускай, що всі гроші через `formatMoney`. Звіти мають власну.

---

## 4. Застаріла документація (не вірити)

| Файл | Що написано | Реальність |
|---|---|---|
| `docs/ARCHITECTURE.md` | Express, Handlebars, MongoDB, Node 8+ | Plain Node `http`, власний Router, JSON файли в `data/`, Node 22+ |
| `docs/ARCHITECTURE.md:30` | `npm install` + `npm start` на 3000 порту | `npm start` → порт 8080 з `config/default.json` |

> Архітектурний документ версії 2.0 (травень 2019) не оновлювався після міграції з MongoDB/Express.

---

## 5. Мертвий код (не чіпати)

| Шлях | Що це | Чому залишився |
|---|---|---|
| `lib/legacy/templates.js` | Handlebars-подібний двигун + хелпери `money`, `date`, `upper` | PDF-сервіс видалили 2020, код залишився "на всякий" |
| `lib/legacy/pdf-client.js` | Клієнт зовнішнього PDF-сервісу | Сервісу більше немає |
| `lib/legacy/mongo-migrate.js` | Міграція з MongoDB в JSON | Виконано разово 2022, не запускати знову |
| `bin/fix-2022-duplicate-customers.js` | Одноразовий фікс дублікатів клієнтів | **Коментар у файлі:** "ALREADY APPLIED ON PROD ON 2022-08-09. DO NOT RUN AGAIN." |

---

## 6. Два етапи імпорту платежів (без локів!)

```js
// lib/payments/index.js
prepareImport(text)  // читає store, пише НІЧОГО, повертає plan
apply(plan)          // пише payments, paid invoices, credits, unmatched
```

> **Race condition:** між `prepareImport` і `apply` немає блокування. Якщо двоє імпортують одну виписку одночасно — `bank_ref` врятує, якщо перший уже `apply`. Сталось 2022. Не запускай паралельно.

---

## 7. Дані: формати зберігання

- **Дати:** `YYYY-MM-DD` рядки (ISO 8601 UTC) — `lib/store.js:9`
- **Гроші:** цілі копійки (integer kopecks) — `lib/store.js:9`
- **ПДВ:** 20% на **підсумку** (subtotal), округлення half-up до копійки — `lib/invoices/index.js:16-26`. Не змінювати на per-line VAT (бухгалтерія просила 2018).
- **Нумерація:**
  - Інвойси: `INV-YYYY-NNNNN` (5 цифр)
  - Замовлення: `ORD-YYYY-NNNN` (4 цифри), legacy без номера → `ORD-<year>-<id>`

---

## 8. Як запускати тести

```bash
cd app && npm test        # node --test, 120 тестів
npm run export            # нічний CSV → out/export/
npm run reminders         # нагадування → out/mail/
```

> Тести пишуться у `app/test/` з Node built-in test runner. Характеризаційні тести — у `app/test/export/`, `app/test/legacy/`.

---

## 9. Чек-лист перед зміною форматування дат/грошей

1. `grep -r "require.*format" lib/**/*.js bin/*.js` — знайди всіх імпортерів
2. Перевір `config/export-columns.json` — які колонки `type: "Date"` / `"Decimal"`
3. Прочитай `docs/integrations/oblik-plus.md` — чи чіпає зміна бухгалтерію?
4. Додай характеризаційний тест **до** зміни (golden master)
5. Запусти `npm test` — всі 120 мають бути зелені

---

## 10. Корисні посилання

- `docs/codebase-map.md` — повна карта (Task A)
- `docs/impact.md` — аналіз впливу зміни форматування дат (Task B)
- `docs/ai-on-legacy.md` — 5 помилок агента, щоб не повторювати (Task D)
- `materials/ticket-BILL-482.md` — оригінальний тікет