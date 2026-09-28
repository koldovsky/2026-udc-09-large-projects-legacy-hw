# Аналіз впливу — BILL-482

> Task B. Заповнюється **до** зміни коду.
>
> Розділи 1-4 описують стан **до** BILL-482 (коміт з тестами `ac903d4`), і
> номери рядків у них — на той момент. Після зміни в `app/lib/format.js`
> з'явилась `formatDateUa`, тож рядки зсунулись (`formatDate` тепер `:31-36`),
> а рахунок і листи беруть дату з неї. Поточний стан — розділ 5.
> Позначки **(коментар)** / **(документ)** — твердження, яке в коді не
> перевіряється, а взяте з коментаря чи з `app/docs/`.

## 1. Що саме змінюється

Дати, які бачать клієнти (у HTML-рахунку й у листах-нагадуваннях), мають
перейти з `MM/DD/YYYY` (`03/09/2026`) на `дд.мм.рррр` (`09.03.2026`). Усі ці
дати зараз формує одна спільна функція `formatDate` (`app/lib/format.js:29-34`).
Але ця ж функція формує дати в нічному CSV для «Облік-Плюс», де формат має
**лишитися** `MM/DD/YYYY`. Тому просто змінити `formatDate` не можна: так
зламається інтеграція з бухгалтерією.

## 2. Хто від цього залежить

| # | Споживач (файл) | Як дістається до зміненої поведінки | Хто читає результат: людина чи інша система | Що з ним має статися після тікета |
|---|---|---|---|---|
| 1 | HTML-рахунок через HTTP: `GET /invoices/:number` (`app/lib/invoices/routes.js:28-37`, маршрут `:63`) | Прямий виклик: `render.renderInvoiceHtml()` → `format.formatDate(invoice.issued_at)` і `format.formatDate(invoice.due_at)` (`app/lib/invoices/render.js:38-39`). Маршрут поза `/api/`, тож `x-staff-id` не потрібен (`app/lib/http/router.js:101`) | **Людина**: клієнт або менеджер у браузері. Сторінку тікет називає прямо (`/invoices/INV-2026-00007`) | **Змінитись**: «Дата» і «Сплатити до» → `дд.мм.рррр`. Це і є баг з тікета |
| 2 | HTML-рахунок через CLI: `bin/render-invoice.js` (`app/bin/render-invoice.js:22`) | Транзитивно: та сама `render.renderInvoiceHtml()` → `formatDate` (`render.js:38-39`); вихід іде в stdout (приклад у коментарі `render-invoice.js:3`: `> invoice.html`) | **Людина**: той самий HTML-документ рахунку. Що з файлом роблять далі, у репо не видно | **Змінитись** разом із № 1: функція та сама, і це той самий документ для клієнта |
| 3 | Листи-нагадування: `bin/send-reminders.js` (cron 09:00 **(коментар)**) → `app/out/mail/<дата>-<kind>-<id>.txt` | Транзитивно: `send-reminders.js:20` → `reminders.buildReminders()` → `body()` → `format.formatDate(invoice.due_at)` в обох варіантах листа: прострочення (`app/lib/notifications/reminders.js:40`) і «нагадуємо» (`:46`). Тема листа (`subject`, `:26-30`) дати не містить | **Людина**: клієнт. SMTP-relay забирає файли з теки й відправляє (`send-reminders.js:3-4` **(коментар)**); коду relay у репо немає, тож те, що текст не змінюється, — припущення | **Змінитись**: «сплатити до 03/12/2026» → «сплатити до 12.03.2026». Про це прямо просить тікет |
| 4 | Нічний CSV для «Облік-Плюс»: `bin/nightly-export.js` (cron 02:30 **(коментар)**) → `app/out/export/oblik-YYYY-MM-DD.csv` | **Не за іменем, а динамічно.** `nightly-export.js:25` → `accounting.buildAccountingFile()` → `cell()` → `format['format' + col.type]` (`app/lib/export/accounting.js:29-35`). Для колонок `DocDate` (`issued_at`) і `PayUntil` (`due_at`) у `app/config/export-columns.json:3-4` стоїть `"type": "Date"`, тобто викликається `formatDate`. У файлі `accounting.js` слова `formatDate` немає | **Інша система**: «Облік-Плюс» забирає файл сам о 06:00 (коментар `bin/nightly-export.js:4`) і приймає лише `MM/DD/YYYY` (`app/docs/integrations/oblik-plus.md:23`) **(документ)** | **Лишитись як є**, байт у байт. Рядок з іншою датою «Облік-Плюс» не відхиляє, а **мовчки пропускає**: у лютому 2021 так «зникли» 40 рахунків (`oblik-plus.md:29-35`). Бухгалтерію треба попереджати щонайменше за тиждень (`oblik-plus.md:42-43`). Контракт відомий лише з цього документа (див. `docs/codebase-map.md`, № 9) |

**Пастки поруч зі зміною:**

- `pad()` у `app/lib/format.js:13` спільна для `formatDate`, `formatMoney` і
  `formatDecimal` (`:33,48,59`). Якщо зміна зачепить `pad`, зміняться й суми,
  зокрема `NetAmount`/`Vat`/`Amount` у тому самому CSV для «Облік-Плюс».
- Колонки експорту бухгалтерія переставляє в `export-columns.json` без деплою
  (`oblik-plus.md:12-13`, там же: «Типи колонок не міняти»), тож будь-яка нова колонка з `"type": "Date"` теж
  піде через ту саму функцію. Якщо перейменувати або прибрати `formatDate` з
  експорту `format.js`, `cell()` кине `unknown column type "Date"`
  (`accounting.js:31-33`), і нічний експорт упаде.

**Не залежать** (перевірено, після тікета лишаються як є):

| Що | Чому не зачеплено |
|---|---|
| Текстові й JSON-звіти (`app/lib/reports/*`, `bin/monthly-report.js`) | Свої дати (`app/lib/reports/dates.js`), `format.js` не імпортують. Дати в дебіторці виводяться сирим ISO (`app/lib/reports/render.js:40,45-46`); про звіти тікет не просить |
| JSON API (`/api/invoices`, `/api/customers/:id/invoices` тощо) | Віддають `issued_at`/`due_at` із даних як ISO, без `format.js` (`app/lib/invoices/routes.js:15`, `app/lib/customers/index.js:213-214`) |
| Хелпер `date` (`dmy`, уже `дд.мм.рррр`) у `app/lib/legacy/templates.js` і `app/lib/legacy/pdf-client.js` | Мертвий код: теки `templates/` немає, `pdf-client.js` ніхто не імпортує |
| Парсер виписки KB-2 (`app/lib/payments/statement.js`) | Це вхід (`DDMMYYYY` → ISO), своя функція `toIsoDate` |

## 3. Як ви їх шукали

Команди запускались з `app/`, у робочому коді й тестах:

1. **За іменем:** `grep -rn "formatDate" server.js lib bin config test`
   → лише `lib/invoices/render.js:38-39` і `lib/notifications/reminders.js:40,46`
   (+ саме визначення в `lib/format.js`). **Споживача № 4 цей пошук не
   показує.**
2. **За модулем, а не за функцією:**
   `grep -rnE "require\([^)]*format['\"]\)" server.js lib bin test`
   → окрім двох уже знайдених, ще `lib/export/accounting.js:9`. Отже, модуль
   форматування імпортує ще хтось, хто не згадує `formatDate` на ім'я.
3. **Динамічний доступ:** `grep -rnE "format\[|'format' *\+" server.js lib bin test`
   → `lib/export/accounting.js:30`: `format['format' + col.type]`. Ім'я функції
   складається з рядка конфігурації, тож далі
   `grep -n '"Date"' config/*.json` → `config/export-columns.json:3-4`
   (`DocDate`, `PayUntil`). Шлях підтверджено прогоном `buildAccountingFile` на
   фікстурах: `INV-2026-00001;03/01/2026;03/15/2026;…` (див.
   `docs/codebase-map.md`, № 7).
4. **Транзитивно, від споживачів до точок входу:**
   `grep -rn "renderInvoiceHtml\|buildReminders\|buildAccountingFile" server.js lib bin`
   → `lib/invoices/routes.js:34` (HTTP), `bin/render-invoice.js:22`,
   `bin/send-reminders.js:20`, `bin/nightly-export.js:25`. Інших викликів
   немає.
5. **Хто читає вихід:** для кожної точки входу — куди йде результат
   (HTTP-відповідь, stdout, `out/mail`, `out/export`) і хто його забирає. Це
   взято з коду й коментарів `bin/*.js` та з `app/docs/integrations/oblik-plus.md`.
6. **Виключення:** шукав інші місця, де дати показують людям (`issued_at`,
   `due_at` у `lib/reports`, `lib/customers`, `lib/invoices/routes.js`), і
   власні форматери дат (`toIsoDate`, `dmy`). Жодне з цих місць `format.js` не
   використовує, див. таблицю «Не залежать».

**Що знайшов пошук за іменем, а що ні:** за іменем знайшлося 2 з 4 споживачів
(рахунок і нагадування; CLI-рахунок видно лише транзитивно). Найризикованішого
споживача, CSV для «Облік-Плюс», можна знайти тільки пошуком за `require`
модуля або за динамічним доступом `format[...]` і з урахуванням
`config/export-columns.json`.

**Контрольна перевірка, що нікого не пропущено.** Два методи, незалежні від
текстового пошуку вище. Обидва дали ті самі 4 споживачі.

1. **Статично: граф `require`.** Скрипт пройшов усі `require` у `server.js`,
   `lib/**` і `bin/*`, зокрема динамічний `require(m)` у `server.js:24`
   (список модулів маршрутів `server.js:10-18`), і знайшов усі модулі, з яких
   можна дістатися до `lib/format.js`.
   - Точки входу, що **доходять** до `format.js`: `server.js` (через
     `lib/invoices/routes.js` → `lib/invoices/render.js`),
     `bin/nightly-export.js`, `bin/render-invoice.js`, `bin/send-reminders.js`.
   - Точки входу, що **не доходять**: `bin/monthly-report.js`,
     `bin/import-statement.js`, `bin/fix-2022-duplicate-customers.js`,
     `lib/audit/retention.js`, `lib/legacy/mongo-migrate.js`.
   - Єдиний динамічний доступ до модуля:
     `format['format' + col.type]` (`lib/export/accounting.js:30`).
2. **Динамічно: трасування викликів.** У копії `app/` поза репо
   `formatDate` підмінювався через `NODE_OPTIONS=--require` на обгортку, яка
   записує стек викликів. Потім запускались **усі** точки входу: 26
   HTTP-маршрутів справжнього сервера (GET, POST, PATCH з валідними тілами) і
   9 скриптів (`bin/*` включно з `--apply` / `--json`,
   `lib/audit/retention.js`, `lib/legacy/mongo-migrate.js`).

   | Точка входу | Хто викликав `formatDate` | Споживач |
   |---|---|---|
   | `GET /invoices/:number` | `lib/invoices/render.js:38,39` ← `lib/invoices/routes.js:34` | № 1 |
   | `bin/render-invoice.js` | `lib/invoices/render.js:38,39` ← `bin/render-invoice.js:22` | № 2 |
   | `bin/send-reminders.js` | `lib/notifications/reminders.js:40` і `:46` ← `buildReminders` | № 3 |
   | `bin/nightly-export.js` | `lib/export/accounting.js:34` (`render(...)` у `cell()`), двічі на рахунок | № 4 |
   | решта 25 маршрутів і 5 скриптів | жодного виклику | — |

   Трасування бачить лише ті шляхи, що виконались; решту закриває статичний
   граф: інші точки входу до `format.js` не доходять узагалі. Усі записи
   (експорт, листи, імпорт оплат, аудит) робились лише в копії, яку потім
   видалено; `app/data/` і `app/out/` у репо не змінювались.

**Покриття тестами зараз** (для пункту 2):

| Що | Чи зафіксовано |
|---|---|
| Рахунок | `test/invoices.test.js:41-42` фіксує `03/09/2026` і `03/23/2026` |
| Нагадування | Тексту з датою не перевіряє жоден тест: `test/reminders.test.js` перевіряє лише, який лист і кому |
| CSV «Облік-Плюс» | Тестів немає взагалі: `grep -rln "accounting\|buildAccountingFile" test` → нічого |
| Сам `formatDate` | Не перевіряється: `test/format.test.js` його не викликає |

## 4. Характеризаційні тести

Файл: `app/test/characterization/date-consumers.test.js`. Еталони (golden
master) у `app/test/characterization/golden/` знято з **незміненого** коду
одноразовим скриптом, який у репо не входить. Вони збережені як JSON, бо
CRLF у CSV для «Облік-Плюс» — частина контракту: JSON-екранування `\r\n`
переживає `core.autocrlf`, а сирі `.csv`/`.html` цього не гарантують. Дані
беруться з `app/data/` лише на читання, у `app/out/` нічого не пишеться.

| Тест | Що фіксує | Зелений на незміненому коді? |
|---|---|---|
| `formatDate: current output is MM/DD/YYYY in UTC` | Сама спільна функція: `03/09/2026`, доповнення нулями, кінець року, рядок із часом, `Date` в UTC | так |
| `formatDate: empty and broken input give an empty string` | `''`, `null`, `undefined`, «не дата», `Invalid Date` → `''` | так |
| `GET /invoices/INV-2026-00007 serves the golden HTML` | **Споживач 1.** Справжній HTTP-сервер (`createServer().listen(0)`): статус 200, `content-type`, увесь HTML дорівнює `golden/invoice-INV-2026-00007.json` («Дата: 03/07/2026 · Сплатити до: 03/21/2026») | так |
| `bin/render-invoice.js prints the same golden HTML` | **Споживач 2.** CLI у дочірньому процесі: код 0, stdout дорівнює тому самому еталону | так |
| `renderInvoiceHtml: dates line of every seeded invoice matches the golden` | **Споживачі 1-2.** Рядок дат для всіх 36 рахунків із фікстур (`golden/invoice-dates.json`) | так |
| `buildReminders on the seed data for 2026-03-18 matches the golden` | **Споживач 3.** Усі 13 листів дня (2 `upcoming`, 11 `overdue`): адресат, тема, текст (`golden/reminders-2026-03-18.json`), плюс явно «слід сплатити до 03/21/2026.» і «мав бути сплачений до 03/16/2026.» | так |
| `buildAccountingFile on the seed data matches the golden byte for byte` | **Споживач 4.** Увесь CSV для «Облік-Плюс» байт у байт, з CRLF (`golden/oblik-export.json`): заголовки, `MM/DD/YYYY`, суми `1234.50`, `;` | так |
| `Облік-Плюс file: DocDate and PayUntil are MM/DD/YYYY of issued_at / due_at` | **Споживач 4, контракт без еталону:** для кожного рядка `DocDate`/`PayUntil` = `MM/DD/YYYY` від `issued_at`/`due_at`; колонки шукаються за заголовком, тож тест витримує перестановку колонок у `export-columns.json` | так |

**Чи ловлять тести зміну.** Перевірка без змін у репо: preload-скрипт
(`NODE_OPTIONS=--require …`) підміняв у пам'яті `formatDate` на
`дд.мм.рррр`. Результат — червоні **всі 8** тестів, зокрема обидва тести
експорту для «Облік-Плюс», тобто сценарій лютого 2021 року («тести зелені, а
рахунки не потрапили в облік») тепер помітний.

Не зафіксовано: «конверт» файлу листа (`To:`/`Subject:` і ім'я файлу в
`bin/send-reminders.js:24-25`). Скрипт пише у фіксовану `app/out/mail`, а дати
з `formatDate` у конверті немає (ім'я файлу бере ISO-дату запуску).

> Пізніше в тому самому файлі: у Task C оновлено дати в трьох еталонах для
> людей (розділ 5), у Task E додано ще 3 тести — `formatDateUa: DD.MM.YYYY in
> UTC`, `formatDateUa: empty and broken input give an empty string`,
> `Облік-Плюс file: draft invoices are left out` (`docs/task-e-bonus.md`).
> Разом зараз 11 характеризаційних тестів, `npm test` → 117/117.

Коміт із тестами (до зміни): `ac903d4`

Як перевірено «зелені на незміненому коді»: коміт `ac903d4` не змінює нічого
в `app/lib/`, `app/bin/`, `app/config/`, `app/data/`, `app/server.js`
(`git diff main --stat -- …` → порожньо). На ньому `cd app && npm test` →
`tests 114, pass 114, fail 0` (106 засіяних + 8 характеризаційних), і в
робочій копії, і у свіжому клоні `ac903d4`, де git переписав файли на CRLF
(`core.autocrlf=true`).

## 5. Після зміни (Task C)

Зміна: нова `formatDateUa` у `app/lib/format.js` (`ДД.ММ.РРРР`); на неї
перемкнено лише `app/lib/invoices/render.js:38-39` і
`app/lib/notifications/reminders.js:40,46`. Код `formatDate`, `accounting.js`
і `config/export-columns.json` не змінювались. У `formatDate` виправлено лише
хибний JSDoc («the date in ISO format» → що це `MM/DD/YYYY` для «Облік-Плюс»
і чому його не можна міняти).

Мінімальність дифу (Task C, пункт 4): код — `+15/−2` у `format.js`
(нова функція, рядок експорту, JSDoc `formatDate`), по `+2/−2` у `render.js`
і `reminders.js`; тести — лише рядки з датами. Без рефакторингу, без
перейменувань, без нових залежностей; `git diff --check` чистий.

`cd app && npm test` на зміненому коді → `tests 114, pass 109, fail 5`.

Як відрізнено «очікувано» від «регресії»: у новому виході кожного червоного
тесту дати `ДД.ММ.РРРР` переведено назад у `MM/DD/YYYY` і порівняно з
еталоном, знятим до зміни. Для всіх чотирьох характеризаційних тестів
результат `true`: вихід відрізняється **лише** датами, решта (HTML, суми,
адресати, теми, кількість листів) збігається байт у байт.

| Тест | Почервонів? | Очікувано (вихід мав змінитись) чи регресія? | Що зробили |
|---|---|---|---|
| `characterization: GET /invoices/INV-2026-00007 serves the golden HTML` | так | **Очікувано.** Споживач № 1, читає людина. Змінились лише 2 дати: `03/07/2026` → `07.03.2026`, `03/21/2026` → `21.03.2026`; сторінку тікет називає прямо | Еталон `golden/invoice-INV-2026-00007.json`: замінено 2 дати `MM/DD/YYYY` → `ДД.ММ.РРРР`; явна перевірка `date-consumers.test.js:85` → `07.03.2026` / `21.03.2026` |
| `characterization: bin/render-invoice.js prints the same golden HTML` | так | **Очікувано.** Споживач № 2, той самий HTML-документ для клієнта; відмінність — ті самі 2 дати | Окремо нічого: тест звіряє з тим самим еталоном, що й попередній рядок |
| `characterization: renderInvoiceHtml: dates line of every seeded invoice …` | так | **Очікувано.** Споживачі № 1-2: рядок дат усіх 36 рахунків, у кожному лише формат дат | Еталон `golden/invoice-dates.json`: замінено 72 дати (36 рахунків × 2) `MM/DD/YYYY` → `ДД.ММ.РРРР` |
| `characterization: buildReminders on the seed data for 2026-03-18 …` | так | **Очікувано.** Споживач № 3, читає клієнт: лише дата в тексті («до 21.03.2026», «до 16.03.2026»); 13 листів, адресати, теми, типи й `invoice_id` без змін. Про листи тікет просить прямо | Еталон `golden/reminders-2026-03-18.json`: замінено 13 дат (по одній у листі); явні перевірки `date-consumers.test.js:118,121` → `21.03.2026`, `16.03.2026` |
| `test/invoices.test.js: rendered invoice shows number, customer, dates and totals` (засіяний) | так, на `:41` (`03\/09\/2026`); `:42` (`03\/23\/2026`) застаріє так само | **Очікувано.** Це дослівно приклад з тікета: `03/09/2026` має стати `09.03.2026`; фактичний вихід — «Дата: 09.03.2026 · Сплатити до: 23.03.2026» | `test/invoices.test.js:41-42` → `09.03.2026`, `23.03.2026`; решта перевірок тесту (номер, ЄДРПОУ, сума) без змін |
| `characterization: buildAccountingFile … matches the golden byte for byte` | **ні** | Споживач № 4 («Облік-Плюс», інша система) — вихід не змінився, регресії немає | нічого |
| `characterization: Облік-Плюс file: DocDate and PayUntil are MM/DD/YYYY …` | **ні** | Контракт `MM/DD/YYYY` для «Облік-Плюс» виконується | нічого |
| `characterization: formatDate: current output …`, `… empty and broken input …` | **ні** | `formatDate` не змінено (він тепер лише для експорту) | нічого |
| решта 105 засіяних тестів | **ні** | — | нічого |

**Регресій немає:** жоден вихід, який читає інша система, не змінився.

**Як оновлено очікування.** Еталони не перегенеровано з нового коду: у
старих еталонах механічно замінено кожну дату `MM/DD/YYYY` → `ДД.ММ.РРРР`
(regex по датах, лічильник замін: 2 + 72 + 13 — рівно стільки дат у цих
виходах). Так правка еталонів доводить сама себе: змінились лише дати.
Оновлено тільки виходи для людей (споживачі № 1-3). **Не змінювались:**
`golden/oblik-export.json` (у ньому лишились усі 72 дати `MM/DD/YYYY`), обидва
тести експорту, тести `formatDate`, `app/lib/export/`, `app/config/`,
`app/data/` (`git diff --stat` по них порожній).

Після оновлення: `cd app && npm test` → `tests 114, pass 114, fail 0`.

### Перевірка Task C

| Умова | Результат | Доказ |
|---|---|---|
| Усі 106 засіяних тестів і ваші — зелені | ✅ | Засіяні (26 тестових файлів із `main`, `git ls-tree -r --name-only main test`): `node --test <вони>` → `tests 106, pass 106`. Характеризаційні: `node --test test/characterization/date-consumers.test.js` → `tests 8, pass 8` |
| Жоден вихід, який читає інша система, не змінився | ✅ | Один і той самий скрипт зібрав 30 виходів у двох копіях `app/` поза репо: «до» (`git archive c0f984b`) і «після» (робоча копія зі зміною), порівняння байт у байт. **Ідентичні всі 26 машинних:** CSV `out/export/oblik-2026-03-18.csv` для «Облік-Плюс» (реальний файл від `bin/nightly-export.js`), `monthly-report --json` (без `generated_at`, це поточний час), `import-statement --json` (dry run), 23 JSON-/текстові HTTP-маршрути (`/health`, `/api/invoices`, `/api/customers*`, `/api/products*`, `/api/stock/low`, `/api/orders*`, `/api/payments*`, усі 4 звіти JSON і текст, `/api/audit`, dry run `price-import` і `payments/import`). Ідентичний і текст місячного звіту для пошти. **Відрізняються лише 2 виходи для людей:** `out/mail/*.txt` і `GET /invoices/INV-2026-00007`, і в обох після зворотного перетворення `ДД.ММ.РРРР` → `MM/DD/YYYY` вихід збігається з «до» байт у байт |
| Кожне змінене очікування пояснене | ✅ | `git diff -U0 -- app/test`: `date-consumers.test.js:85,118,121`; `golden/invoice-INV-2026-00007.json` (1 рядок, 2 дати); `golden/invoice-dates.json` (36 рядків, 72 дати); `golden/reminders-2026-03-18.json` (13 рядків, 13 дат); `invoices.test.js:41-42`. Кожен файл і кожен рядок пояснено в таблиці вище (колонка «Що зробили») |
