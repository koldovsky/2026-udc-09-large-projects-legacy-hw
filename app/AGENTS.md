# AGENTS.md — `app/` (prykladpostach-billing)

Нотатки для агента (і людини), який прийде сюди наступним. Читати **до**
того, як щось міняти. Написано після тікета BILL-482 (жовтень 2026). Усе
нижче перевірено за кодом і командами, а не за `docs/` — див. «Яка
документація застаріла».

## Що це і як запускати

- Бек-офіс білінгу, якому вісім років. **CommonJS, колбеки, `var`, жодних
  npm-залежностей, без збірки.** Не переводити на ESM/async, не перейменовувати,
  не «чистити» сусідній код. Маленький диф — це норма тут.
- `npm test` — вбудований `node --test`, ~1 с, усе в одному процесі.
- `npm start` — порт 8080 (`PORT` перекриває). Для змін у форматуванні сервер
  не потрібен: усе перевіряється через `node -e` з `lib/*` (приклади внизу).
- Запущений сервер і `bin/*` **пишуть** у `data/*.json` та `out/` — див. «Пастки».

## Контракти з іншими системами (результат читає не людина)

| Канал | Код → куди | Контракт | Тест, який його тримає |
|---|---|---|---|
| **«Облік-Плюс»** (бухгалтерія) | `bin/nightly-export.js` → `lib/export/accounting.js` → `out/export/oblik-YYYY-MM-DD.csv`; сервер бухгалтерії забирає файл сам о 06:00 | UTF-8, `;`, CRLF, заголовок; **дати `MM/DD/YYYY`** (американська локаль); суми `1234.50`; текст без `;`. Колонки і їх типи — `config/export-columns.json`; порядок можна міняти, **типи — ні**. Рядок з датою в іншому форматі сервер **мовчки пропускає**: ні помилки в нас, ні листа від них. У лютому 2021 так зникли 40 рахунків, помітили за три тижні. Контакт: головбух Марина, вн. 214, попереджати за тиждень | `test/export/accounting.test.js` — golden master рядка. Якщо він червоніє — це регресія, а не «оновити очікування» |
| Старий адмін-UI | `GET /api/customers/:id/invoices` → `lib/customers/index.js:31-37, 221` | `totals.outstanding` — рядок `5793.05`: крапка, без пробілів і без «грн» (власний `fmtAmount`) | `test/customers/routes.test.js:62` |
| BI-таблиця (Олена, щопонеділка) | `GET /api/reports/*` → `lib/reports/render.js:107` | JSON із **сирими копійками** (`*_kopecks`) і `generated_at` в ISO. Не форматувати | `test/reports/text.test.js:50` |
| Пошта директору і бухгалтерії | `bin/monthly-report.js` stdout → crontab → лист; текст вставляють в Excel | `lib/reports/table.js:4-6`: фіксована ширина, без рамок і табуляцій, суми `12 345,67` без «грн» | `test/reports/text.test.js` |
| SMTP-relay | `bin/send-reminders.js:25` → `out/mail/<date>-<kind>-<id>.txt` | файл = `To:`, `Subject:`, порожній рядок, тіло. Relay забирає файли сам; тіло читає клієнт | `test/reminders.test.js` |
| Reverse proxy + LDAP | `lib/http/router.js:91-101` | проксі ставить `x-staff-id`; без нього `/api/*` → 401. `GET /invoices/:number` і `GET /health` — **публічні**, без заголовка | `test/*/routes.test.js` |
| Банк (виписка KB-2) | `bin/import-statement.js`, `POST /api/payments/import` → `lib/payments/statement.js` | фіксована ширина, дати `DDMMYYYY`, суми в копійках; cp1251 → UTF-8 робить SFTP-міст поза репо | `test/payments/*.test.js` |
| Відділ закупівель | `POST /api/products/price-import` → `lib/catalog/price-import.js` | `sku;ціна_грн[;примітка]` з Excel, кома або крапка; захист від стрибка ціни ×10; пише `price_history` | `test/catalog/price-import.test.js` |

## Дати: два форматери, і це навмисно

`lib/format.js` після BILL-482 має **дві** функції дати. Не «уніфікувати» їх
назад в одну — саме так стався інцидент 2021 року.

| Функція | Вихід | Хто читає | Споживачі |
|---|---|---|---|
| `formatDate` | `MM/DD/YYYY` | **машина** («Облік-Плюс») | `lib/export/accounting.js:30` — і дістається до неї **не за іменем**, а через `format['format' + col.type]` з типом `Date` у `config/export-columns.json`. `grep formatDate` цього споживача **не покаже** |
| `formatDateUa` | `дд.мм.рррр` | **людина** (клієнт) | `lib/invoices/render.js:38-39` (HTML `GET /invoices/:number`, `bin/render-invoice.js`), `lib/notifications/reminders.js:40,46` (листи) |

- Побічний ефект динамічного виклику: тип колонки `DateUa` у
  `export-columns.json` тепер технічно резолвиться. **Не використовувати** —
  «Облік-Плюс» такі рядки пропустить.
- У сховищі дати — рядки `YYYY-MM-DD` в UTC (`lib/store.js:9`), мітки часу —
  `toISOString()`. «Так, це "вчора" до 03:00 за Києвом» (`lib/customers/index.js:26`).
  Виняток: `lib/catalog/price-import.js:30-34` будує дату з **локального** часу.
- По модулях розкидано шість+ незалежних копій `toIsoDate`/`daysBetween`
  (`invoices`, `orders`, `customers`, `audit`, `reports/dates`, `catalog/stock`,
  `notifications/reminders`). Жодна з них не викликає `lib/format.js`; це не
  дублікати для «винесення в спільний модуль».

## Гроші

Цілі копійки, поля з суфіксом `_kopecks`, ніколи float. У семи файлах вісім
різних `fmtAmount`/`formatMoney` з **різним** виходом (`1 234,50 грн`,
`1234.50`, `12 345,67`, `5793.05`, `95,50`) — кожен під свого читача, не
зводити до одного. ПДВ (`lib/invoices/index.js:16-17`) рахується на підсумок
рахунку і округлюється half-up до копійки: «бухгалтерія просила у 2018, не
"виправляти" на построкове».

## Пастки

- **Пошук за іменем функції знаходить не всіх споживачів.** Для будь-якого
  спільного модуля шукайте також `require\(.*<модуль>` і `<модуль>\s*\[`
  (динамічний виклик). У BILL-482 `grep formatDate` давав два файли з трьох.
- **Запущений сервер пише в `data/*.json`** — це ті самі фікстури, які читають
  тести (`lib/store.js`: кеш у пам'яті, `save()` переписує файл цілком). Не
  ганяйте POST/PATCH проти репозиторного `data/`; тести відкривають тимчасові
  каталоги через `store.open(dir)`. `bin/nightly-export.js` і
  `bin/send-reminders.js` пишуть в `out/` (у `.gitignore`; не комітити).
- **Коментарі брешуть.** `lib/audit/routes.js:2-3`: «записи пишуть самі модулі
  через `audit.record()`» — жоден модуль поза тестами його не викликає, журнал
  у проді порожній (перевірка: `grep -rl "require(.*audit" lib bin server.js`).
  JSDoc `formatDate` вісім років обіцяв «ISO format» і повертав `MM/DD/YYYY`
  (виправлено в BILL-482).
- **Мертвий код, що виглядає живим:** `lib/discounts/*` (відключено 2023,
  «nothing calls this module»), `lib/legacy/*` (Mongo, pdf-render, Handlebars —
  усе зникло 2020; каталогу `templates/` немає), `lib/customers/merge.js`
  (CLI так і не написали), `config/features.json` (`loyaltyDiscounts` читає
  лише мертвий модуль, `newAgingBuckets` — ніхто). Його `require`-ять тільки
  тести, тому тести на нього зелені й нічого не доводять.
- `lib/invoices/routes.js:47` переводить замовлення в `invoiced` прямим
  `store.update`, в обхід машини станів `lib/orders/status.js`.
- `bin/fix-2022-duplicate-customers.js` — одноразовий скрипт 2022 року:
  «DO NOT RUN AGAIN. DO NOT ADD TO CRON».
- Розклад cron є **лише в коментарях** до `bin/*` і `lib/audit/retention.js`;
  crontab у репозиторії немає. Що реально крутиться на «старому сервері»,
  з коду не видно.
- **Покриття.** До BILL-482 жоден тест не торкався `formatDate`, дати в листі
  й усього `lib/export/accounting.js`: `npm test` був зелений при будь-якому
  форматі дати. Тепер є характеризаційні тести (`test/format.test.js`,
  `test/reminders.test.js`, `test/export/accounting.test.js`) — вони тут
  навмисно, не видаляти як «дубль».
- **Сідові тести на HTML і листи зелені, але мало що тримають** (мутаційне
  тестування, `docs/task-e-bonus.md`): `test/invoices.test.js` перевіряє п'ять
  фрагментів, тож можна прибрати всю розмітку, замінити `qty * price` на
  `qty / price` або **видаляти** `<` замість екранувати в `esc()` — тест
  лишиться зеленим; `subject()` листів не перевіряє ніхто. Якщо треба
  закріпити вихід для людини — робіть golden master усього HTML чи листа
  (`subject` + `text`), а не `assert.match` на шматки.
- Windows + Git Bash: `2>/dev/null`, а не `2>nul` (створює файл `nul`).

## Яка документація застаріла

| Документ | Стан |
|---|---|
| `docs/ARCHITECTURE.md` (2019) | **Застаріла майже повністю.** Express, Handlebars і `templates/`, MongoDB, порт 3000, `lib/mail`, `lib/export/csv.js`, «інтеграції тільки SMTP, бухгалтерія забирає CSV вручну», «форматування для людей — лише в шаблонах» — нічого з цього не існує з 2020 (`lib/http/router.js:4-5`, `lib/store.js:1-4`, `package.json` без залежностей). Правдиві лише два рядки: дати ISO у сховищі, гроші в копійках |
| `README.md` | Команди правильні; посилання «Архітектура: див. `docs/ARCHITECTURE.md`» веде на застарілий документ |
| `docs/integrations/oblik-plus.md` (2021) | **Актуальна.** Кожне твердження збігається з `lib/export/accounting.js`, `config/export-columns.json` і `bin/nightly-export.js`. Саме її легко відкинути як «таку ж стару» — не робіть цього |
| Заголовки `lib/*/*.js`, `bin/*` | Здебільшого точні й корисніші за `docs/`. Відомі винятки: `lib/audit/routes.js:2-3` і (до BILL-482) JSDoc `formatDate` |

## Перед будь-якою зміною форматування дат або грошей

```bash
cd app
npm test
# рядок для «Облік-Плюс» на реальних фікстурах — має лишитись MM/DD/YYYY
node -e "var a=require('./lib/export/accounting'),i=require('./data/invoices.json'),c=require('./data/customers.json'),b={};c.forEach(function(x){b[x.id]=x});console.log(a.buildAccountingFile(i,b).split('\r\n')[1])"
# те, що бачить клієнт
node bin/render-invoice.js INV-2026-00007 | grep -o 'Дата: .*</p>'
node -e "var r=require('./lib/notifications/reminders'),i=require('./data/invoices.json'),c=require('./data/customers.json'),b={};c.forEach(function(x){b[x.id]=x});r.buildReminders(i,b,'2026-03-13').slice(0,1).forEach(function(m){console.log(m.text)})"
```

Перший рядок експорту має й далі виглядати як
`INV-2026-00001;03/01/2026;03/15/2026;10000001;ТОВ «Зелений Кут»;4827.50;965.50;5793.00`.
Якщо ні — бухгалтерія про це не дізнається, а ви дізнаєтесь через три тижні.
