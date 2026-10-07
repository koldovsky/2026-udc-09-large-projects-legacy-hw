# Аналіз впливу — BILL-482

> Task B. Заповнено **до** зміни коду `app/lib/format.js`.

## 1. Що саме змінюється

`format.formatDate()` (`app/lib/format.js:29-34`) сьогодні повертає
`MM/DD/YYYY` (напр. `03/09/2026`; JSDoc над функцією каже «ISO format» — це
неправда вже зараз, не тільки після тікета). BILL-482 просить перевести
дату в рахунках і листах-нагадуваннях на український формат `дд.мм.рррр`
(напр. `09.03.2026`). Це єдина функція форматування дати, спільна для всіх
споживачів нижче — `formatMoney`, `formatDecimal`, `formatText`,
`formatPercent` тікет не торкається.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | `app/lib/invoices/render.js:38-39` | Прямий виклик `format.formatDate(invoice.issued_at / due_at)` у `renderInvoiceHtml()`. Дістається двома шляхами: HTTP `GET /invoices/:number` (`lib/invoices/routes.js`, без `x-staff-id` — публічний) і CLI `bin/render-invoice.js INV-... > invoice.html` | **Людина** — клієнт, що відкриває HTML-рахунок у браузері (саме цей сценарій описаний у тікеті: `/invoices/INV-2026-00007`) | **Змінитися.** Це прямо те, що просить тікет: `03/09/2026` → `09.03.2026`. |
| 2 | `app/lib/notifications/reminders.js:40,46` | Прямий виклик `format.formatDate(invoice.due_at)` у `body()`. Дістається через cron 09:00 робочих днів `bin/send-reminders.js` → пише `.txt` у `out/mail/` → звідти файли забирає SMTP-relay → лист клієнту | **Людина** — клієнт отримує email із нагадуванням | **Змінитися.** Тікет прямо називає цей самий симптом: «сплатити до 03/12/2026» у листі-нагадуванні. |
| 3 | `app/lib/export/accounting.js:29-34` | **Непрямий, динамічний** виклик: `cell()` робить `format['format' + col.type]`, і для колонок `DocDate`/`PayUntil` (`config/export-columns.json`, `type: "Date"`) це резолвиться в `format.formatDate`. Дістається через cron 02:30 `bin/nightly-export.js` → пише `out/export/oblik-YYYY-MM-DD.csv` → сервер «Облік-Плюс» сам забирає файл о 06:00 | **Інша система** — бухгалтерський сервер «Облік-Плюс», який стоїть з американською локаллю | **Лишитися `MM/DD/YYYY`, не змінюватись.** Тікет про цей канал не каже нічого, а `app/docs/integrations/oblik-plus.md` прямо попереджає: сервер **мовчки пропускає** рядок, якщо дата не `MM/DD/YYYY` (без помилки й без листа від них). У лютому 2021 так уже «загубили» 40 рахунків на три тижні. Якщо дату тут все ж колись треба буде змінити — попередити бухгалтерію (головбух Марина, вн. 214) мінімум за тиждень. |

**Важливо:** рядок #3 означає, що тікет «одна функція, дрібна правка» —
правда лише наполовину. Функція справді одна, але вона не може просто
змінити формат для всіх трьох споживачів одразу: #1 і #2 мають стати
українськими, #3 має лишитися американським. Тому в Task C потрібно або
розділити форматер (новий `formatDate` для людей + окрема функція/колонка
типу для `export/accounting.js`, яка і далі дає `MM/DD/YYYY`), або явно
підв'язати `export-columns.json`/`accounting.js` до старої поведінки. Яке
саме рішення — вирішується в Task C; тут важливо, що колонки `DocDate` і
`PayUntil` повинні продовжувати видавати `MM/DD/YYYY` **після** правки.

### Що знайдено, але **не** є споживачем

У кодовій базі ще щонайменше шість незалежних копій
`toIsoDate`/`daysBetween`/`monthName` (`lib/reports/dates.js`,
`lib/orders/index.js`, `lib/catalog/price-import.js`, `lib/customers/index.js`,
`lib/audit`, `lib/catalog/stock.js`) — вони **не** викликають
`format.formatDate`, це окремі реалізації для ISO-рядків/арифметики дат, а
не для показу людині. Зміна `format.formatDate` їх не торкається.
`lib/legacy/*` і `lib/discounts/*` ніхто не `require`-ить поза тестами
(мертвий код) — так само поза зоною впливу.

## 3. Як ви їх шукали

1. `Grep "formatDate"` по `app/` — показав саму функцію (`lib/format.js`) і
   три місця використання: `lib/invoices/render.js`, `lib/notifications/reminders.js`.
   Пошук за іменем **не знайшов** третього споживача — `lib/export/accounting.js`
   викликає форматер динамічно через `format['format' + col.type]`, рядка
   `formatDate` там немає текстом.
2. Щоб знайти динамічних споживачів, зробив `Grep "require\(.*format"` по
   `app/` — усі файли, що підвантажують `lib/format.js` цілим модулем:
   `lib/invoices/render.js`, `lib/notifications/reminders.js`,
   `lib/export/accounting.js`, і сам `app/test/format.test.js`. Прочитав
   кожен повністю, щоб перевірити, які саме функції з модуля вони
   насправді викликають (а не просто імпортують).
3. Прочитав `app/config/export-columns.json` (типи колонок `Date`/`Decimal`/
   `Text` — саме `type` обирає, яку функцію з `format.js` викликати) і
   `app/docs/integrations/oblik-plus.md` — звідти і взявся висновок про
   мовчазне пропускання рядків сервером «Облік-Плюс».
4. Перевірив, що інші `toIsoDate`-подібні функції в `lib/reports/dates.js`,
   `lib/orders/index.js`, `lib/catalog/price-import.js` тощо — окремі копії,
   не `require`-ять `lib/format.js` (кожна з них своя й не викликає
   `formatDate`), тож зміна на них не впливає.
5. Прогнав поточний код на реальних фікстурах (`node -e …` з
   `lib/format`, `lib/export/accounting`, `lib/notifications/reminders`),
   щоб зафіксувати точні рядки виводу для характеризаційних тестів, а не
   вгадувати їх руками.
6. Переглянув `app/test/` (`Grep` за `formatDate|\d\d/\d\d/\d{4}|buildAccountingFile`):
   HTML-дата рахунку вже побіжно пінилась в `app/test/invoices.test.js`
   (рядки 41-42, існуючий сідовий тест), але дата в тексті листа-нагадування
   і весь модуль `lib/export/accounting.js` **не мали жодного тесту**.

## 4. Характеризаційні тести

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `app/test/format.test.js` — `formatDate: current output is MM/DD/YYYY` (новий) | Саму функцію `format.formatDate`: рядок `YYYY-MM-DD`, `Date`-об'єкт, однозначна/неоднозначна дата, `''`/`null`/невалідний вхід → `''` | так |
| `app/test/invoices.test.js` — `rendered invoice shows number, customer, dates and totals` (вже існував до цього тікета) | HTML-рахунок: `Дата: 03/09/2026`, `Сплатити до: 03/23/2026` | так |
| `app/test/reminders.test.js` — `reminder mail date uses the shared formatter` (новий) | Повний текст листа-нагадування (upcoming і overdue) з датою `03/12/2026` — той самий приклад, що в тексті тікета | так |
| `app/test/export/accounting.test.js` (новий файл) — `accounting export: DocDate/PayUntil stay MM/DD/YYYY` | Golden master повного CSV-рядка для «Облік-Плюс»: `DocDate`/`PayUntil` → `MM/DD/YYYY` | так |
| `app/test/export/accounting.test.js` — `missing dates render as empty cells` | Що порожня/відсутня дата дає порожню клітинку, а не падіння | так |

Коміт із тестами (до зміни): `<заповнити після коміту>`

## 5. Після зміни (Task C)

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| — | — | — | Заповнюється в Task C. Очікування вже зараз: тест 1 і тест HTML-рахунку та текст нагадування — мають почервоніти й оновитися на `дд.мм.рррр` (очікувана зміна); обидва тести `export/accounting.test.js` — мають лишитися зеленими без змін (якщо почервоніли — це регресія, рівносильна інциденту лютого 2021). |
