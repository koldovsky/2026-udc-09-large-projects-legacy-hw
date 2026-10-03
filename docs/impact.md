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

Коміт із тестами (до зміни): `TBD-COMMIT-B`

## 5. Після зміни (Task C)

Заповнюється в Task C.
