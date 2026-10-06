# Аналіз впливу — BILL-482

## 1. Що саме змінюється

Спільна `format.formatDate` (`app/lib/format.js:29`) зараз повертає `MM/DD/YYYY`.
Після тікета дати, які бачать **клієнти**, мають бути `дд.мм.рррр`. Проблема: ту
саму функцію використовує й машина — нічний CSV для «Облік-Плюс», якому потрібен
саме `MM/DD/YYYY`.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | HTML-рахунок: `app/lib/invoices/render.js:38-39` (`GET /invoices/:number`, `bin/render-invoice.js`) | прямий виклик `format.formatDate(issued_at / due_at)` | **людина** (клієнт) | **змінитись** → `07.03.2026` (це й є тікет) |
| 2 | Листи-нагадування: `app/lib/notifications/reminders.js:40,46` (`bin/send-reminders.js` → `out/mail/*.txt`) | прямий виклик `format.formatDate(due_at)`, обидва види — `upcoming` і `overdue` | **людина** (клієнт) | **змінитись** → `12.03.2026` (в тікеті названо явно) |
| 3 | Нічний CSV: `app/lib/export/accounting.js:30` (`bin/nightly-export.js` → `out/export/oblik-*.csv`) | **непрямо**: `format['format' + col.type]`, колонки `DocDate` і `PayUntil` мають `type: "Date"` у `app/config/export-columns.json`. Пошук за `formatDate` цього не знаходить | **інша система** («Облік-Плюс») | **лишитись `MM/DD/YYYY`**. Інший формат вони мовчки пропускають (`app/docs/integrations/oblik-plus.md:29-35`; у 2021 так зникло 40 рахунків). Попередження бухгалтерії — за тиждень |

Перевірено й **не залежать**: звіти (`app/lib/reports/*` — власні ISO-дати й
`monthName`), JSON API (віддає ISO зі сховища), `payments`, `catalog`,
`customers`, `orders`, `audit` — `formatDate` не імпортують.

## 3. Як ви їх шукали

- `grep -rnE "formatDate|require\(['\"][./]*format['\"]\)" app` (без тестів):
  знайшов споживачів 1 і 2, а також три `require('../format')` — у `render.js`,
  `reminders.js` і **`accounting.js`**. Ім'я `formatDate` у `accounting.js`
  відсутнє.
- Звідси третій споживач: `accounting.js` імпортує модуль і викликає
  `format['format' + col.type]`. Прочитав `config/export-columns.json`: два
  стовпці типу `Date`. Підтвердив запуском: нинішній експорт містить
  `03/01/2026;03/15/2026`.
- Перевірив `docs/integrations/oblik-plus.md` — вимога `MM/DD/YYYY` і наслідки.
- `grep` за `toISOString|getUTC|toLocale` — решта дат у коді ISO й від
  `formatDate` не залежить.

**Висновок для зміни:** не можна просто поправити тіло `formatDate`. Треба
розвести споживачів: людям — нове форматування, експорту — `MM/DD/YYYY` як було.

## 4. Характеризаційні тести

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `app/test/characterization.test.js` → «invoice HTML» + `golden/invoice-INV-2026-00007.html` | повний HTML рахунку INV-2026-00007 (дати `03/07/2026`, `03/21/2026`) | так |
| там само → «reminder mails» + `golden/reminders.txt` | листи `upcoming` і `overdue` (`03/12/2026`) | так |
| там само → «nightly accounting CSV» + `golden/accounting-export.csv` | весь CSV із сид-даних байт-у-байт (CRLF, `;`) + явна перевірка, що `DocDate` і `PayUntil` у кожному рядку — `MM/DD/YYYY` | так |

Усі три зелені: `cd app && npm test` → 109 pass (106 засіяних + 3). Золоті файли
захищено `.gitattributes` (`-text`), щоб CRLF не псувався на Windows.

Коміт із тестами (до зміни): `ca3377f`

## 5. Після зміни (Task C)

Що зроблено: у `app/lib/format.js` додано `formatDateUk` (`DD.MM.YYYY`); `render.js` і `reminders.js` викликають її замість `formatDate`. `formatDate` (`MM/DD/YYYY`) не змінено — нею далі користується експорт через `type: "Date"`, конфіг не чіпали. У JSDoc `formatDate` виправлено хибне «ISO» і додано попередження про контракт з бухгалтерією.

| Тест | Почервонів? | Очікувано чи регресія? | Що зробили |
|---|---|---|---|
| `characterization` · invoice HTML (+ `golden/invoice-INV-2026-00007.html`) | так | **очікувано**: людина-клієнт, `03/07/2026` → `07.03.2026`, `03/21/2026` → `21.03.2026` (тікет) | оновлено еталон, лише рядок із датами |
| `characterization` · reminder mails (+ `golden/reminders.txt`) | так | **очікувано**: людина-клієнт, `03/12/2026` → `12.03.2026` в обох листах (тікет називає листи явно) | оновлено еталон, лише два рядки з датою |
| `invoices.test.js` · rendered invoice shows number, customer, dates and totals | так | **очікувано**: той самий HTML-рахунок, `03/09/2026` → `09.03.2026`, `03/23/2026` → `23.03.2026` | оновлено два регулярні вирази |
| `characterization` · nightly accounting CSV (+ `golden/accounting-export.csv`) | **ні** | — читає інша система, нічого не мало змінитись | еталон не чіпали (`git diff` порожній) |

Усього: `npm test` — 109 зелених. `app/data/*.json` і `config/` не змінені.
