# Аналіз впливу — BILL-482

> Task B. Заповнено **до** зміни коду. Розділ 5 заповнюється в Task C.

## 1. Що саме змінюється

Дати, які **бачать клієнти**, тобто HTML-рахунок і листи-нагадування, мають
показуватися як `дд.мм.рррр` (`09.03.2026`) замість `MM/DD/YYYY` (`03/09/2026`).

Усі ці дати формує одна спільна функція `formatDate` (`app/lib/format.js:29-34`).
Її ж **без згадки імені** викликає нічний CSV для бухгалтерії «Облік-Плюс», а там
формат `MM/DD/YYYY` — контракт, який змінювати не можна. Тому правка «в одній
функції» зламала б бухгалтерію.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | `app/lib/invoices/render.js:38-39` `renderInvoiceHtml` | **Прямий виклик** `format.formatDate(invoice.issued_at)` і `formatDate(invoice.due_at)`. До нього ведуть дві точки входу: **1a** `GET /invoices/:number` (`lib/invoices/routes.js:28-37,63`; публічний, бо `x-staff-id` перевіряється лише для `/api/*`, `router.js:101`) і **1b** CLI `bin/render-invoice.js` (HTML у stdout) | **Людина**: клієнт відкриває рахунок у браузері | **Змінитись** на `дд.мм.рррр`. Тікет прямо називає `/invoices/INV-2026-00007` |
| 2 | `app/lib/notifications/reminders.js:40` (лист `overdue`) і `:46` (лист `upcoming`) | **Прямий виклик** `format.formatDate(invoice.due_at)` у тексті листа. Точка входу: cron 09:00 `bin/send-reminders.js` → файли `out/mail/<дата>-<kind>-<id>.txt` → SMTP-relay | **Людина**: клієнт читає лист. Relay лише пересилає текст і не розбирає його (`send-reminders.js:3-4,25`) | **Змінитись** на `дд.мм.рррр`. Тікет: «у листах-нагадуваннях теж „сплатити до 03/12/2026“». Тема листа й імена файлів у `out/mail` дат через `formatDate` не містять, тож не зміняться |
| 3 | `app/lib/export/accounting.js:29-35` `cell()` | **Непрямо, без імені функції:** `format['format' + col.type]`, де `type: "Date"` береться з `config/export-columns.json` для колонок `DocDate` (`issued_at`) і `PayUntil` (`due_at`). Точка входу: cron 02:30 `bin/nightly-export.js` → `out/export/oblik-YYYY-MM-DD.csv`; «Облік-Плюс» забирає файл сам о 06:00 | **Інша система**: імпорт «Облік-Плюс», сервер з американською локаллю | **Лишитись як є, `MM/DD/YYYY`.** За контрактом (`app/docs/integrations/oblik-plus.md:23`) рядок з іншою датою **мовчки пропускається**, і помилки не видно ні в нас, ні в них. У 2021 так зникли 40 рахунків (`:29-35`). Також: бухгалтерія може додати в JSON ще одну колонку типу `Date` «без деплою», і вона теж піде через ту саму функцію |
| 4 | `app/test/invoices.test.js:41-42` | Прямо фіксує HTML-рахунок: `Дата: <b>03\/09\/2026</b>`, `Сплатити до: <b>03\/23\/2026</b>` | CI, тобто розробник | **Змінити очікування** разом зі споживачем 1. Це очікувана зміна, а не регресія |

### Перевірено: від зміни **не** залежать

| Що | Чому не залежить | Доказ |
|---|---|---|
| Звіти (`/api/reports/*`, `?format=text`, `bin/monthly-report.js`) | Власні `lib/reports/dates.js` і `table.js#fmtAmount`; `format.js` не підключають. Дати в aging виводяться сирим ISO | `grep "require.*format" app/lib` → лише 3 модулі зі списку вище |
| JSON API (`/api/invoices`, `/api/invoices/:id`, …) | Віддають поля зі сховища як є, тобто ISO | `lib/invoices/routes.js:14-16,24` |
| Внутрішні дати: `orders/index.js:22-25`, `invoices/index.js:9-13`, `catalog/price-import.js:33`, `payments/statement.js` | Власні локальні функції ISO та парсер `DDMMYYYY` | `grep "getUTCMonth\|getMonth(\|toLocale" app/lib` |
| Валідація вхідних дат (`reports/routes.js`, `audit/routes.js`, `orders/routes.js`, `catalog/routes.js:51`) | Це **вхід**, приймає лише `YYYY-MM-DD`; `formatDate` не використовує | відповідні рядки в тестах відхиляють `31.03.2026` і `23.09.2026` |
| `lib/legacy/templates.js`, `pdf-client.js` | Мертвий код, `format.js` не підключає | граф `require` (`docs/codebase-map.md`, п. 14) |
| `formatMoney`, `formatDecimal`, `formatText`, `formatPercent` | Тікет їх не стосується | — |

## 3. Як ви їх шукали

1. **`grep formatDate app/lib`** знайшов лише 2 споживачі: `invoices/render.js` і
   `notifications/reminders.js`. Пошук за іменем на цьому зупиняється.
2. **`grep "require\([^)]*format" app/`** знайшов 3 модулі, що підключають
   `format.js`. Третій, `export/accounting.js`, не містить рядка `formatDate`
   **ніде**. У коді видно `format['format' + col.type]` (`:30`), а тип `"Date"`
   лежить у `config/export-columns.json`. Так знайшли прихованого споживача.
   «Find references» в IDE і LSP його теж не покажуть, бо ім'я збирається рядком
   у runtime.
3. Коментар у самому `format.js:4-5` («Shared by the invoice renderer, the reminder
   mails and the exports») правильно перелічує всіх трьох. Його ми перевірили
   кроком 2, а не взяли на віру.
4. **Хто викликає споживачів:** граф `require` і `grep` по `renderInvoiceHtml`,
   `buildReminders`, `buildAccountingFile` показали точки входу: маршрут
   `/invoices/:number`, `bin/render-invoice.js`, `bin/send-reminders.js`,
   `bin/nightly-export.js`.
5. **Інший код із датами** (`getUTCMonth`, `getMonth(`, `toLocale…`, `Intl.`)
   знайшов незалежні локальні функції в reports, orders, catalog і legacy. Вони
   від `formatDate` не залежать.
6. **Тести:** `grep "\d{2}\\?/\d{2}\\?/\d{4}" app/test` знайшов `invoices.test.js:41-42`.
   Перший `grep` без `\\?` цей рядок **пропустив**, бо слеші там екрановані.
   Це помилка агента в Task A, виправлена в карті (п. 4).
7. **Прогін коду в пам'яті** (рахунок, нагадування на `2026-03-20`, CSV) показав
   реальний вихід, з якого зроблено golden-файли.
8. **Документ про контракт:** `app/docs/integrations/oblik-plus.md` пояснює, хто
   читає CSV і що буде при зміні формату. `ARCHITECTURE.md` натомість стверджує,
   що «форматування для людей — лише в шаблонах» і «інтеграції: тільки SMTP».
   Обидва твердження хибні (`docs/codebase-map.md`, 3b).

## 4. Характеризаційні тести

Файл `app/test/characterization/bill-482.test.js`, еталони лежать у
`app/test/characterization/golden/`. Еталони згенеровані з **незміненого** коду
(`UPDATE_GOLDEN=1`) і перевірені вручну: у HTML `03/07/2026`, у 18 листах `до MM/DD/YYYY`,
CSV має 37 рядків із CRLF. `.gitattributes` у теці еталонів (`* -text`) не дає
git змінити CRLF у CSV при checkout на Windows.

| Тест | Що фіксує | Зелений на незміненому коді? | Що чекаємо після Task C |
|---|---|---|---|
| `formatDate: current output for every input shape` | `formatDate` на ISO, ISO з часом, `Date`, `''`/`null`/`undefined`, сміття | так | залежить від реалізації (див. розділ 5) |
| `invoice HTML for INV-2026-00007` | Увесь HTML рахунку з тікета, байт у байт → `golden/invoice-INV-2026-00007.html` | так | 🔴 очікувано |
| `GET /invoices/:number serves exactly that HTML` | Той самий HTML через HTTP-маршрут (споживач 1a) | так | 🔴 очікувано |
| `bin/render-invoice.js prints exactly that HTML` | Той самий HTML через CLI (споживач 1b), справжній процес `node` | так | 🔴 очікувано |
| `reminder mails due on 2026-03-20 (both kinds)` | Усі 18 листів (16 `overdue`, 2 `upcoming`, обидві гілки) → `golden/reminders-2026-03-20.json` | так | 🔴 очікувано |
| `Облік-Плюс export file, byte for byte` | Увесь CSV (36 рахунків + заголовок, `;`, CRLF) → `golden/oblik-export.csv` | так | 🟢 **має лишитись зеленим** |
| `Облік-Плюс contract: DocDate and PayUntil are MM/DD/YYYY` | Не знімок, а **контракт**: кожна дата в CSV має вигляд `MM/DD/YYYY` і збігається з ISO в даних | так | 🟢 **має лишитись зеленим завжди** |
| `app/test/invoices.test.js:37-44` (засіяний) | Дати в HTML-рахунку `03/09/2026`, `03/23/2026` | так | 🔴 очікувано |

Прогін на незміненому коді: `node --test` → **tests 113, pass 113, fail 0**
(106 засіяних + 7 нових).

Коміт із тестами (до зміни): `<hash — вписати після коміту>`

## 5. Після зміни (Task C)

_Заповнюється в Task C._

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| <...> | <...> | <...> | <...> |
