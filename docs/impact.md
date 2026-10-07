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
   два файли з чотирма викликами: `lib/invoices/render.js` (2),
   `lib/notifications/reminders.js` (2).
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

Коміт із тестами (до зміни): `0027324`

## 5. Після зміни (Task C)

### Що саме змінили в коді

`formatDate` **не чіпали**: на її вихід `MM/DD/YYYY` зав'язаний експорт для
«Облік-Плюс» через `format['format' + col.type]` і тип колонки `Date` у
`config/export-columns.json`. Замість цього в `app/lib/format.js` додано
окрему функцію `formatDateUa` (`дд.мм.рррр`, та сама обробка `''`/`null`/
невалідного входу → `''`), і на неї переведено **лише два клієнтські
виходи**: `lib/invoices/render.js:38-39` і `lib/notifications/reminders.js:40,46`.
Попутно виправлено JSDoc над `formatDate`, який обіцяв «ISO format»: тепер
він каже правду (`MM/DD/YYYY`), пояснює, хто від цього залежить, і відсилає до
`formatDateUa` для дат, які бачать клієнти.

Диф по `app/lib/`: три файли, 4 змінені рядки виклику (по 2 в кожному
споживачі) + нова функція й один рядок у `module.exports`. `lib/export/accounting.js`,
`config/export-columns.json`, `app/data/*.json` — без змін.

Відкинуті варіанти:

- Змінити сам `formatDate` на `дд.мм.рррр` і дати експорту новий тип колонки
  (`DateUs`) — вимагає правити `export-columns.json`, а
  `app/docs/integrations/oblik-plus.md` прямо каже: «**Типи колонок не міняти**».
  І вихід для бухгалтерії залежав би від конфіга, який бухгалтерія ж і просить
  переставляти.
- Змінити `formatDate` і зробити виняток для типу `Date` всередині
  `lib/export/accounting.js` — це правка в найризикованішому файлі заради
  тікета, який про нього не каже.

### Результат прогону тестів (на зміненому коді, до оновлення очікувань)

`npm test`: 110 тестів, **108 зелених, 2 червоних**. Обидва червоні — виходи
для людей; обидва тести експорту й тест `formatDate` лишилися зеленими.

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| `app/test/invoices.test.js` — `rendered invoice shows number, customer, dates and totals` | **Так**: `Дата: <b>09.03.2026</b>` замість `03/09/2026`, `Сплатити до: <b>23.03.2026</b>` замість `03/23/2026` | **Очікувано.** Це HTML-рахунок `/invoices/INV-2026-00007` — екран, з якого починається тікет; читає клієнт | Оновили два `assert.match` на `09\.03\.2026` і `23\.03\.2026`, старі значення залишили в коментарі |
| `app/test/reminders.test.js` — `reminder mail date uses the shared formatter (characterization, BILL-482)` | **Так**: `до 12.03.2026` замість `до 03/12/2026` в обох текстах (upcoming і overdue) | **Очікувано.** Лист-нагадування — другий симптом із тікета («сплатити до 03/12/2026»); читає клієнт | Оновили обидва очікувані тексти листа цілком, уточнили коментар |
| `app/test/format.test.js` — `formatDate: current output is MM/DD/YYYY (characterization, BILL-482)` | Ні | — (регресії немає: `formatDate` навмисно не змінено) | Нічого. Поруч додали новий тест `formatDateUa: дд.мм.рррр for customers` на ті самі входи, щоб обидва форматери читалися пліч-о-пліч |
| `app/test/export/accounting.test.js` — `accounting export: DocDate/PayUntil stay MM/DD/YYYY (characterization, BILL-482)` | **Ні** | — (саме це й треба було: вихід для «Облік-Плюс» не змінився) | Нічого, файл не торкались. Golden master `INV-2026-00007;03/09/2026;03/23/2026;…` збігається побайтово |
| `app/test/export/accounting.test.js` — `accounting export: missing dates render as empty cells` | Ні | — | Нічого |

Після оновлення двох очікувань: `npm test` → **111 тестів, 111 зелених, 0
червоних** (106 засіяних + 4 характеризаційних з Task B + 1 новий на `formatDateUa`).

### Перевірка на реальних фікстурах (не лише на тестових об'єктах)

| Канал | Команда | Результат |
|---|---|---|
| HTML-рахунок (людина) | `node bin/render-invoice.js INV-2026-00007` | `Дата: <b>07.03.2026</b> · Сплатити до: <b>21.03.2026</b>` |
| Листи-нагадування (людина) | `node -e` з `lib/notifications/reminders.buildReminders` на `data/invoices.json` | `…слід сплатити до 16.03.2026.` / `…мав бути сплачений до 16.03.2026.` |
| CSV для «Облік-Плюс» (система) | `node -e` з `lib/export/accounting.buildAccountingFile` на `data/invoices.json` | 36 рядків; `DocDate`/`PayUntil` у всіх 36 відповідають `^\d\d/\d\d/\d{4}$`; перший рядок `INV-2026-00001;03/01/2026;03/15/2026;…` без змін |

Файли в `app/out/` при цьому не створювались (перевірка через `node -e`, не
через cron-скрипти), `app/data/*.json` не змінено.

### Побічний ефект, про який варто знати наступному

Через динамічний виклик `format['format' + col.type]` поява `formatDateUa`
означає, що в `config/export-columns.json` тепер «законним» став тип колонки
`DateUa`. Ніхто його не використовує і не повинен: «Облік-Плюс» такий рядок
мовчки пропустить. Це варто записати в `app/AGENTS.md` (Task D).
