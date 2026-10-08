# app/AGENTS.md — що знати до першої правки

Білінг ТОВ «Приклад Постач»: Node 22+, CommonJS, колбеки, без npm-залежностей. `npm test` запускає `node --test`.

## Контракти з іншими системами (ламаються без жодної помилки)

- **«Облік-Плюс» (бухгалтерія).**
  - **Звідки файл:** `bin/nightly-export.js` (cron 02:30) пише `out/export/oblik-YYYY-MM-DD.csv`, а їхній сервер сам забирає його о 06:00.
  - **Формат:** `;`, CRLF, UTF-8, дата **`MM/DD/YYYY`**, суми `1234.50`.
  - **Рядок з іншою датою не відхиляється, а мовчки пропускається** (`docs/integrations/oblik-plus.md:23,29-31`). У лютому 2021 так «зникли» 40 рахунків.
  - **Форматер обирається динамічно:** `format['format' + col.type]` (`lib/export/accounting.js:30`), тип береться з `config/export-columns.json`. Тому зміна будь-якої функції `formatX` у `lib/format.js` може змінити експорт, а **нова** функція одразу стає доступною як тип колонки `X`. Пошук за іменем цього не покаже.
  - **Колонки** на прохання бухгалтерії переставляють у JSON без деплою, а їхні типи не міняють (`oblik-plus.md:12-13`). Про зміну формату попереджати їх мінімум за тиждень (`oblik-plus.md:42-43`).
- **Клієнти:**
  - HTML-рахунок: `GET /invoices/:number` (без `x-staff-id`) і `bin/render-invoice.js`;
  - листи-нагадування: `bin/send-reminders.js` → `out/mail/*.txt`, звідти їх забирає SMTP-relay.

  Обидва виходи показують дати через `formatDateUa` у форматі `ДД.ММ.РРРР` (BILL-482).
- **Старий адмін-UI** отримує від `GET /api/customers/:id/invoices` суму `totals.outstanding` як рядок `5793.00`, без пробілів і без «грн» (`lib/customers/index.js:31-32,221`, `lib/customers/routes.js:94`). Проксі ставить `x-staff-id` після входу через LDAP (`lib/http/router.js:91-101`).
- **BI-таблиця** щопонеділка бере JSON з `/api/reports/*`: сирі копійки й ISO-дати (`lib/reports/render.js:2-3`).
- **Директор і бухгалтерія** отримують поштою текстовий місячний звіт (`bin/monthly-report.js:9-10`), і бухгалтерія вставляє його в Excel (`lib/reports/table.js:5-6`).

## Пастки

- **`formatDate` — це формат для «Облік-Плюс», а не для людей.** Для клієнтів є `formatDateUa` (`lib/format.js:30-48`). `formatDate` не змінювати, доки бухгалтерія не переналаштує імпорт. Її стережуть тести в `test/characterization/bill-482-dates.test.js`: T6, T6 CONTRACT, T7.
- **Обидві функції по-різному читають рядок і `Date`** (спільний `toDate`). З рядка беруться перші 10 символів, час і зсув пояса ігноруються; `Date`-об'єкт читається в UTC. Наприклад, `formatDate('2026-03-09T23:30:00-05:00')` дає `03/09/2026`, а `formatDate(new Date(те саме))` — `03/10/2026`.
- **`server.js:23-27` ковтає `MODULE_NOT_FOUND`.** Якщо модуль маршрутів або будь-який файл, який він підключає, не знайдено, сервер не падає: маршрути цього модуля просто зникають.
- **Cron живе не лише в `bin/`.** `lib/audit/retention.js:5` запускається щодня о 03:10.
- **Журнал аудиту не пишеться.** `audit.record()` не викликає жоден модуль; `grep -rn "\.record(" lib bin` знаходить лише коментар.
- **Мертвий код, який легко «оживити» помилково:**
  - `lib/legacy/*`: у `templates.js:180-187` є хелпер `date`, що вже видає `дд.мм.рррр`, але його ніхто не підключає;
  - `lib/discounts/*`: прапорець `config/features.json` ні на що не впливає (`discounts/index.js:7-9`);
  - `lib/customers/merge.js`: використовується лише в тестах.
- **Звіти форматують самі:** `lib/reports/dates.js` і `table.js` («Local on purpose», `table.js:13`). Від `lib/format.js` вони не залежать, тож не «уніфікуйте» їх.
- **Час.** Скрізь UTC, крім двох місць: `lib/catalog/price-import.js:30-33` (локальна дата) і мертвого `lib/legacy/mongo-migrate.js` (Europe/Kiev).

## Застаріла документація

- **`docs/ARCHITECTURE.md` (2019) застарів повністю.** Там описано Express, Handlebars `templates/`, MongoDB, порт 3000, `lib/export/csv.js`, `lib/mail` і «лише SMTP». Насправді:
  - `node:http` + `lib/http/router.js`;
  - JSON-файли в `data/` через `lib/store.js`;
  - порт 8080 (`config/default.json`);
  - `lib/export/accounting.js`;
  - листи — файли в `out/mail`, SMTP-коду немає.
- **`docs/integrations/oblik-plus.md` актуальний.** Це і є контракт.
- **Вгорі `lib/format.js` сказано, що це «Shared by … the exports»,** і це правда. JSDoc `formatDate` до BILL-482 обіцяв «ISO»; виправлено.

## Тести

- **`test/characterization/`** — golden-master для всіх споживачів `formatDate` і `formatDateUa`. `UPDATE_GOLDEN=1` перезаписує **всі** goldens. Після цього переконайтесь, що `git diff` не зачепив `golden/oblik-export.json`.
- **Goldens зберігаються в JSON,** бо в репо `core.autocrlf=input`: сирий CRLF у golden-файлі git перетворив би на LF.
- **`node --test <каталог>` на Node 26 падає.** Передавайте шлях до файлу або запускайте `npm test`.
- **Не змінюйте `data/*.json`:** це спільні фікстури для всіх тестів.
