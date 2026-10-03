# Аналіз впливу — BILL-482

## 1. Що саме змінюється

Дати, які **бачить клієнт**, мають стати `дд.мм.рррр` замість нинішнього
`MM/DD/YYYY`. Це HTML-рахунок (`/invoices/:number`) і листи-нагадування про
оплату.

Тікет пропонує зробити це в «одній функції форматування» —
[`lib/format.js`](../app/lib/format.js) `formatDate`. **Так робити не можна:**
у цієї функції три споживачі, і третій — не людина, а бухгалтерський сервер
«Облік-Плюс», для якого `MM/DD/YYYY` є контрактом. Отже змінюється не спільна
функція, а **два її виклики з двох споживачів, що показують дату людям**;
спільна функція лишається як є для машинного експорту.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат | Що має статися після тікета |
|---|---|---|---|---|
| 1 | [`lib/invoices/render.js:38-39`](../app/lib/invoices/render.js#L38-L39) | прямий виклик `format.formatDate(invoice.issued_at)` і `(invoice.due_at)` | **людина** — клієнт, HTML-рахунок на `GET /invoices/:number` (маршрут поза `/api/`, тобто без автентифікації) і `bin/render-invoice.js` | **змінитись** → `09.03.2026`. Це рівно те, про що тікет |
| 2 | [`lib/notifications/reminders.js:40,46`](../app/lib/notifications/reminders.js#L40-L46) | прямий виклик `format.formatDate(invoice.due_at)` у тілі листа (обидві гілки: `overdue` і `upcoming`) | **людина** — клієнт, лист із `out/mail/`, який забирає SMTP-реле (cron 09:00) | **змінитись** → «сплатити до 09.03.2026». Тікет прямо це згадує |
| 3 | [`lib/export/accounting.js:29-35`](../app/lib/export/accounting.js#L29-L35) | **непрямо**: `format['format' + col.type]`, де `col.type` = `"Date"` для колонок `DocDate` (`issued_at`) і `PayUntil` (`due_at`) у [`config/export-columns.json`](../app/config/export-columns.json) | **МАШИНА** — сервер «Облік-Плюс» забирає `out/export/oblik-YYYY-MM-DD.csv` о 06:00 автоматично (cron 02:30 пише, [`bin/nightly-export.js`](../app/bin/nightly-export.js)) | **лишитись як є** (`MM/DD/YYYY`). Контракт: [`app/docs/integrations/oblik-plus.md:23`](../app/docs/integrations/oblik-plus.md#L23) — «сервер «Облік-Плюс» стоїть з американською локаллю» |

### Чому № 3 — найважливіший рядок цієї таблиці

«Облік-Плюс» **не падає** на даті в чужому формати. Він **молча пропускає
рядок**, пише попередження у свій журнал імпорту, якого ніхто не читає. Ні
помилки в нас, ні листа від них
([`oblik-plus.md:27-35`](../app/docs/integrations/oblik-plus.md#L27-L35)).

У лютому 2021 так втратили **40 рахунків**: хтось змінив форматування дати,
тести були зелені, рахунки просто не потрапили в облік. Знайшли через три
тижні, коли не зійшовся звіт із ПДВ.

Тобто наївне виконання тікета (`formatDate` → `дд.мм.рррр`) дало б **зелені
тести і повторення інциденту 2021 року**: на цей експорт у репо не було
**жодного** тесту (`grep -rln "accounting\|oblik" app/test/` → порожньо).

### Хто **не** залежить (перевірено, щоб не чіпати лишнє)

| Не споживач | Чому |
|---|---|
| `lib/reports/*` (4 звіти, текст і JSON) | мають власне форматування дат і показують сирий ISO; `grep -rn "require(.*format" app/lib/reports/` → нічого. BI-таблиця Олени тягне JSON із датами ISO — не зачіпається |
| JSON API (`GET /api/invoices`, `/api/invoices/:id`, `/api/customers/:id/invoices`) | віддає `issued_at`/`due_at` сирими зі `store`, без форматування: [`lib/invoices/routes.js:16`](../app/lib/invoices/routes.js#L16) |
| `lib/legacy/templates.js` хелпер `date` (`dmy`) | **уже** віддає `дд.мм.рррр` ([`templates.js:180-184`](../app/lib/legacy/templates.js#L180-L184)), але мертвий: `templates/` видалено 2020 разом із PDF-сервісом. Спокуса «уніфікувати» — не чіпаємо |
| `lib/legacy/pdf-client.js` | сервіс вимкнено 11.2020 |
| `app/data/*.json` | дати зберігаються як ISO і такими лишаються; формат зберігання не змінюється |

## 3. Як ми їх шукали

1. **`grep -rn "formatDate" app --include="*.js"`** → `lib/format.js`,
   `lib/invoices/render.js`, `lib/notifications/reminders.js`.
   Тобто **два** споживачі. Якби на цьому зупинитись — інцидент 2021 року
   повторився б.

2. **`grep -rn "require(.*format" app --include="*.js"`** → **три** файли в
   `lib/`: `render.js`, `reminders.js` і **`export/accounting.js`**.
   Різниця між двома й трьома — і була підказкою.

3. Читання [`accounting.js`](../app/lib/export/accounting.js) показало чому:
   ```js
   var render = format['format' + col.type];   // accounting.js:30
   ```
   Ім'я функції збирається з рядка в JSON-конфізі. **Жоден** пошук за іменем
   `formatDate` цього не знайде — ні `grep`, ні LSP «find references»,
   ні ast-grep.

4. **`grep -rn "getUTCMonth\|getUTCDate\|toISOString\|slice(0, 10)"`** —
   щоб знайти форматувальників дат, які взагалі не ходять через `lib/format.js`.
   Знайшло другий, незалежний шлях: `lib/reports/dates.js` + `lib/reports/table.js`
   (сирий ISO) і мертвий `dmy` у `lib/legacy/templates.js`.

5. Перевірка тестового покриття: `grep -rln "accounting\|oblik" app/test/` →
   порожньо; у `test/format.test.js` немає жодного тесту на `formatDate`.
   Тобто обидва найважливіші виходи були не зафіксовані нічим.

**Висновок про метод:** пошук за іменем функції дав 2 з 3 споживачів (67 %), і
пропущений був саме тим, що читає машина. Знайти його можна було лише пошуком за
**модулем** (`require('../format')`), а не за функцією.

## 4. Характеризаційні тести

Написані **до** зміни, зелені на незміненому коді. Кожен тест у
`bill-482-dates.test.js` позначений у назві:
`EXPECTED-TO-CHANGE` (вихід для людей — мусить змінитись за тікетом) або
`MUST-NOT-CHANGE` (змінився → регресія).

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| [`app/test/export/accounting.test.js`](../app/test/export/accounting.test.js) — `golden master: the whole export file over data/` | **golden master**: повний CSV по всіх 36 рахунках із `data/`, байт у байт ([`test/golden/oblik-export.csv`](../app/test/golden/oblik-export.csv), 3 225 Б, 37 рядків) | так |
| те саме — `export contract: CRLF, ";" separator, header row first` | CRLF, роздільник `;`, рядок заголовків, CRLF у кінці файлу | так |
| те саме — `export contract: DocDate and PayUntil stay MM/DD/YYYY` | регексп `MM/DD/YYYY` на обох колонках дат **у кожному** рядку | так |
| те саме — `a known invoice renders exactly as accounting expects` | один рахунок цілим рядком: `INV-2026-00007;03/07/2026;03/21/2026;…` | так |
| те саме — `drafts are left out, other statuses are kept` | фільтр `status !== 'draft'` (у `data/` чернеток немає, тому на фікстурі) | так |
| те саме — `export columns are resolved by type through lib/format.js` | саме́ динамічне зіставлення `type` → `format['format'+type]`, через яке споживач невидимий для `grep` | так |
| [`app/test/characterization/bill-482-dates.test.js`](../app/test/characterization/bill-482-dates.test.js) — `EXPECTED-TO-CHANGE formatDate renders MM/DD/YYYY today` | нинішній вихід `formatDate` (функція **не мала жодного тесту**) | так |
| те саме — `MUST-NOT-CHANGE formatDate edge cases` | `''`, `null`, `undefined`, `'not-a-date'` → `''` | так |
| те саме — `MUST-NOT-CHANGE formatDate reads the date in UTC` | `'2026-03-09T23:59:59+03:00'` → дата не «з'їжджає» на добу | так |
| те саме — `EXPECTED-TO-CHANGE invoice HTML shows both dates MM/DD/YYYY` | `Дата: <b>03/09/2026</b>`, `Сплатити до: <b>03/23/2026</b>` | так |
| те саме — `MUST-NOT-CHANGE invoice HTML keeps everything around the dates` | розмітка `<p class="dates">…`, номер, платник, суми — щоб зміна дати не поїхала в сусідній HTML | так |
| те саме — `EXPECTED-TO-CHANGE upcoming reminder names the due date` | «слід сплатити до 03/23/2026.» | так |
| те саме — `EXPECTED-TO-CHANGE overdue reminder names the due date` | «мав бути сплачений до 03/23/2026.» | так |
| те саме — `MUST-NOT-CHANGE reminder envelope and wording around the date` | `to`, `subject`, `invoice_id`, звертання, підпис | так |
| те саме — `MUST-NOT-CHANGE lib/legacy/templates.js date helper is already dd.mm.yyyy` | мертвий хелпер `dmy` → `09.03.2026`, щоб зміна його не «уніфікувала» | так |
| те саме — `MUST-NOT-CHANGE JSON API exposes stored ISO dates` | `GET /api/invoices` і `/api/invoices/:id` (з `x-staff-id`) віддають `YYYY-MM-DD` | так |
| те саме — `EXPECTED-TO-CHANGE the public HTML invoice route serves MM/DD/YYYY` | end-to-end через `server.js`: `GET /invoices/INV-2026-00007` без автентифікації | так |

**Прогін на незміненому коді:** `cd app && npm test` → **123 тести, 123
зелені** (106 засіяних + 17 нових).

Додано [`app/.gitattributes`](../app/.gitattributes) з `test/golden/*.csv -text`,
щоб git не нормалізував CRLF у golden master — інакше тест, який фіксує CRLF,
перевіряв би не те, що думає.

Коміт із тестами (до зміни): **`7fdd2f5`** — «WS9 Task B: characterization tests
before the BILL-482 change». Зміна коду — в наступному коміті, тести не
підганялись після.

## 5. Після зміни (Task C)

### Що зробили

**`formatDate` не торкались.** Замість зміни спільної функції додали
[`formatDateUA`](../app/lib/format.js) (`дд.мм.рррр`) і перевели на неї двох
споживачів, що показують дату людям. Машинний експорт і далі викликає
`formatDate` → `MM/DD/YYYY`, тому контракт із «Облік-Плюс» не зачеплений, а
`config/export-columns.json` змінювати не довелось (типи колонок міняти
заборонено: [`oblik-plus.md:13`](../app/docs/integrations/oblik-plus.md#L13)).

Диф у проді — **3 файли, 4 функціональні рядки + одна нова функція**:

| Файл | Зміна |
|---|---|
| [`lib/format.js`](../app/lib/format.js) | **+** `formatDateUA`; `formatDate` без змін у тілі; виправлено JSDoc, який брехав («the date in ISO format» → `MM/DD/YYYY`), і додано попередження про молчазне пропускання рядків у «Облік-Плюс» |
| [`lib/invoices/render.js`](../app/lib/invoices/render.js) | 2 виклики `formatDate` → `formatDateUA` |
| [`lib/notifications/reminders.js`](../app/lib/notifications/reminders.js) | 2 виклики `formatDate` → `formatDateUA` (гілки `overdue` і `upcoming`) |

### Червоні тести і що з ними зробили

Після зміни почервоніло **5** тестів із 123. Усі 5 — вихід для людей. **Жоден
`MUST-NOT-CHANGE` і жоден тест експорту не почервонів.**

| Тест | Почервонів? | Очікувано чи регресія? | Що зробили |
|---|---|---|---|
| `EXPECTED-TO-CHANGE invoice HTML shows both dates MM/DD/YYYY today` | так | **очікувано** — HTML-рахунок читає клієнт, це головний пункт тікета | очікування → `09.03.2026` / `23.03.2026`; перейменовано на `BILL-482 invoice HTML shows both dates as DD.MM.YYYY`; додано перевірку, що американської дати в HTML не лишилось |
| `EXPECTED-TO-CHANGE upcoming reminder names the due date MM/DD/YYYY today` | так | **очікувано** — лист клієнту; тікет прямо його згадує | очікування → `23.03.2026` |
| `EXPECTED-TO-CHANGE overdue reminder names the due date MM/DD/YYYY today` | так | **очікувано** — лист клієнту | очікування → `23.03.2026` |
| `EXPECTED-TO-CHANGE the public HTML invoice route serves MM/DD/YYYY today` | так | **очікувано** — та сама сторінка `/invoices/INV-2026-00007` із тікета, end-to-end через `server.js` | очікування → `07.03.2026` / `21.03.2026` |
| `rendered invoice shows number, customer, dates and totals` (**засіяний**, [`test/invoices.test.js:41-42`](../app/test/invoices.test.js#L41-L42)) | так | **очікувано** — єдиний засіяний тест, який фіксував американський формат у HTML-рахунку | очікування → `09.03.2026` / `23.03.2026`, з комментарем, що саме змінилось і чому |
| `EXPECTED-TO-CHANGE formatDate renders MM/DD/YYYY today` | **ні** | — | Лишився зеленим, бо `formatDate` навмисно не змінювали. Перейменовано на `MUST-NOT-CHANGE formatDate stays MM/DD/YYYY — it is the Облік-Плюс wire format`: ярлик був поставлений до того, як вибрали рішення, і тепер він неправильний |

Нових тестів на `formatDateUA` додано 3 (формат, граничні випадки, і перевірка,
що `formatDate` та `formatDateUA` описують **ту саму** дату в різному порядку —
щоб не можна було випадково переплутати день і місяць).

### Чого не змінювали — хоча було спокусливо

- **`formatDate` не перейменовували** на щось типу `formatDateOblik`, хоча назва
  й вводить в оману. Від рядка `'format' + col.type` залежить
  `lib/export/accounting.js`, а `col.type` = `"Date"` приходить із JSON-конфіга.
  Перейменування функції зламало б експорт у рантаймі — і, що гірше, не на
  тестах, а молча. Замість перейменування — попередження в JSDoc і запис у
  [`app/AGENTS.md`](../app/AGENTS.md).
- **`config/export-columns.json`** — не чіпали: типи колонок міняти заборонено.
- **`lib/legacy/templates.js`** — не чіпали, хоча його хелпер `dmy` уже робить
  `дд.мм.рррр`. Код мертвий (`templates/` видалено 2020), і «уніфікувати» його з
  живим форматером — рефакторинг поза тікетом.
- **Звіти** (`lib/reports/*`) — не чіпали: вони показують сирий ISO людям, але
  тікет про рахунки й нагадування, а JSON-звіти тягне BI-таблиця.

### Перевірка результату

| Що перевіряли | Як | Результат |
|---|---|---|
| Уся сюїта | `cd app && npm test` | **126 тестів, 126 зелених** (106 засіяних + 20 наших) |
| Вихід для машини не змінився | `node bin/nightly-export.js 2026-03-31`, потім `diff` з golden master, знятим **до** зміни | **файли ідентичні** |
| HTML-рахунок змінився | `node bin/render-invoice.js INV-2026-00007` | `Дата: <b>07.03.2026</b> · Сплатити до: <b>21.03.2026</b>` |
| Листи змінились | `node bin/send-reminders.js 2026-03-18` | «слід сплатити до **21.03.2026**.» (13 листів) |
| `app/data/*.json` не змінено | `git diff --stat HEAD -- app/data/` | порожньо |
| `app/out/` не закомічено | `app/out/` у `.gitignore`, тека видалена після перевірки | ок |
