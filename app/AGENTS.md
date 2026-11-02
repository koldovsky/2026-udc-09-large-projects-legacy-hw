# app/AGENTS.md — прочитати до будь-якої зміни в `app/`

Неочевидне про цей білінг. У коді прямо цього не видно, а без цього наступна «дрібна правка» знову буде ризикованою.

## 1. Машинний контракт: CSV для «Облік-Плюс»

- `bin/nightly-export.js` (cron 02:30) пише `out/export/oblik-YYYY-MM-DD.csv`. О 06:00 сервер бухгалтерії забирає його сам.
- Формат: `;`, CRLF, UTF-8, дата **`MM/DD/YYYY`**, суми `1234.50` (`app/docs/integrations/oblik-plus.md`, цей документ **актуальний**).
- **Рядок з іншим форматом дати імпорт мовчки пропускає**: ні помилки в нас, ні листа від них. У 2021 так «зникло» 40 рахунків.
- Будь-яка зміна дат, сум чи тексту в `lib/format.js` або `config/export-columns.json` зачіпає цей файл. Перевірка: `node --test test/characterization/dates.test.js`. Еталон `test/characterization/golden/oblik-export.csv` має лишатися **байт-у-байт** тим самим.

## 2. Пастка: споживач, якого не знаходить `grep`

`lib/export/accounting.js:30` обирає форматер **за іменем, складеним із конфігу**: `format['format' + col.type]`, де `type` береться з `config/export-columns.json` (`Date` → `formatDate`, `Decimal` → `formatDecimal`, `Text` → `formatText`). Тому:

- `grep formatDate` експорт **не знаходить**, хоча він від нього залежить;
- **перейменування** будь-якої `format*`-функції в `lib/format.js` ламає експорт уже під час виконання (`unknown column type`);
- **будь-яка нова** `formatXxx` автоматично стає допустимим типом колонки.

## 3. Дати: два форматери, не плутати

| Функція (`lib/format.js`) | Формат | Для кого | Хто викликає |
|---|---|---|---|
| `formatDate` | `MM/DD/YYYY` | **машина** (експорт) | `export/accounting.js` через тип `Date` |
| `formatDisplayDate` | `дд.мм.рррр` | **люди** (BILL-482) | `invoices/render.js`, `notifications/reminders.js` |

Нове місце, де дату читає людина, має використовувати `formatDisplayDate`. `formatDate` **не змінювати на місці**.

## 4. Застаріла документація

- `app/docs/ARCHITECTURE.md` (2019) **застарів повністю**: Express, Handlebars, MongoDB, `lib/mail`, `lib/export/csv.js`, порт 3000. Насправді тут власний роутер `lib/http/router.js`, JSON-файли `data/*.json` через `lib/store.js`, HTML рахунку будується рядками в `lib/invoices/render.js`, експорт лежить у `lib/export/accounting.js`, порт 8080. Твердження «форматування для людей — лише в шаблонах» неправда, бо шаблонів немає.
- Не вір і коментарям. До BILL-482 докстрінг `formatDate` казав «returns ISO», а функція повертала `MM/DD/YYYY`.

## 5. Мертвий код, який збиває з пантелику

- `lib/legacy/templates.js` має свій хелпер `date` (`dmy` → `дд.мм.рррр`), але він **мертвий**: `templates/` немає, а `pdf-client.js` ніхто не імпортує. Його правка нічого не змінить.
- `lib/discounts` ніхто не викликає, прапорець `loyaltyDiscounts` у `config/features.json` нічого не вмикає. `newAgingBuckets` ніхто не читає.
- `audit.record()` не викликає жоден робочий модуль (`lib/`, `bin/`, `server.js`) — лише тести `test/audit/record.test.js`. Тож у продакшні `/api/audit` читає порожній журнал.
- `lib/reports/*` мають **власні** `dates.js` і `table.js` і від `lib/format.js` не залежать.

## 6. Робота з репо на Windows

- `core.autocrlf=true`: робочі файли мають CRLF. Скрипти заміни тексту мають це враховувати, інакше шаблон не знайдеться.
- Еталони в `test/characterization/golden/` позначено `-text` (`.gitattributes` поруч), бо CSV навмисно CRLF. Не прибирай цей атрибут.
- `node --test test/characterization/` (тека) у Node 22 падає з `MODULE_NOT_FOUND`: аргумент сприймається як файл. Передавай шлях до файлу або просто запускай `npm test`.
- Перегенеровуй еталони (`UPDATE_GOLDEN=1 …`) **лише** після рішення, що вихід мав змінитись, і поясни кожен змінений еталон у PR. Диф `oblik-export.csv` — це сигнал зупинитися.
