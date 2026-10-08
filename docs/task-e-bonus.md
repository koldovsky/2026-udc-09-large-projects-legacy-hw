# Task E (bonus) — шлях 2: мутаційне тестування

> Питання: чи вбивають характеризаційні тести з Task B мутантів у форматуванні дат і в його споживачах? Шляхи —
> відносно `app/`. Рядки коду — на коміті `b8016b2` (Task C); у Task E код не змінювався, лише тести (`08f90ea`,
> `48e0116`).

**Коротко:**
- Характеризаційні тести з Task B вбивали **78,6 %** мутантів (220 із 280), після Task E — **82,5 %** (231). Засіяні
  106 тестів — 27,5 %, і **жодного** з 48 мутантів на шляху до «Облік-Плюс».
- Справжні прогалини, усі закриті тестами: перевірки `formatDateUa` на порожню дату; запуск скриптів без дати, як у
  `npm run export`; листи клієнтам без email (релей отримав би `To: undefined`). Ручний мутант знайшов ще одну: дата
  `дд.мм.рррр` у JSON API проходила всі 131 тест.
- Лишилось для окремих тікетів: `esc()` без тестів на публічному маршруті (XSS); форматери грошей і тексту в CSV.

## Інструмент

**StrykerJS 10.0.0 через `npx`**, у копії `app/` поза репо. Залежностей в `app/` не додано, конфіг і звіти не
закомічено.

```bash
git archive -o app.tar HEAD app && tar -xf app.tar -C <тимчасова-тека>   # так працює і в PowerShell
cd <тимчасова-тека>/app                                                  # сюди — stryker.config.json
npx --yes -p @stryker-mutator/core@10.0.0 stryker run
```

<details><summary><code>stryker.config.json</code></summary>

```json
{
  "testRunner": "command",
  "commandRunner": { "command": "node --test \"test/characterization/*.test.js\"" },
  "mutate": [
    "lib/format.js:13-49",
    "lib/export/accounting.js",
    "lib/invoices/render.js",
    "lib/notifications/reminders.js",
    "bin/nightly-export.js",
    "bin/send-reminders.js",
    "bin/render-invoice.js"
  ],
  "coverageAnalysis": "off",
  "concurrency": 4,
  "timeoutMS": 30000,
  "reporters": ["clear-text", "json", "progress"],
  "jsonReporter": { "fileName": "reports/mutation.json" }
}
```

</details>

- **Що мутували:** датову частину `lib/format.js` (`pad`, `toDate`, `formatDate`, `formatDateUa`) і всіх трьох
  споживачів разом зі скриптами з `bin/` — **280 мутантів**.
- **Чого не мутували:** `formatMoney`, `formatDecimal`, `formatText` (гроші й текст, хоча два останні теж ідуть у CSV)
  і `lib/invoices/routes.js`. Їх перевірили лише ручними мутантами (нижче).
- **Чим вбивали:** лише характеризаційними тестами, бо питання про них.
- **Інші рядки таблиці:** «Task B» — та сама команда на копії коміту `acc3098`; «засіяні» — копія без
  `test/characterization/` і `"command": "node --test"`.
- **Вартість:** ≈3 хв на прогін (8 ядер), один прогін тестів — менш як 1 с.

## Результат

| Тести | Убито | Вижило | Mutation score |
|---|---|---|---|
| 106 засіяних | 77 | 203 | 27,5 % |
| Характеризаційні з Task B (21) | 220 | 60 | 78,6 % |
| Характеризаційні після Task E (27) | **231** | 49 | **82,5 %** |

Повний `npm test` убиває ще 4 (їх ловить засіяний `test/reminders.test.js`): лишається 45. Без 4 еквівалентних —
231 / 276 = **83,7 %**.

| Файл | Мутантів | Засіяні | Task B | Після Task E |
|---|---|---|---|---|
| `lib/format.js` (дати) | 34 | 15 | 28 | **32** (решта 2 — еквівалентні) |
| `lib/export/accounting.js` | 28 | **0** | 22 | 22 |
| `bin/nightly-export.js` | 20 | **0** | 16 | **17** |
| `lib/invoices/render.js` | 70 | 25 | 57 | 57 |
| `bin/render-invoice.js` | 25 | 0 | 15 | 15 |
| `lib/notifications/reminders.js` | 77 | 37 | 60 | **65** |
| `bin/send-reminders.js` | 26 | 0 | 22 | **23** |

## Які мутанти вижили і що це каже про тести

60 мутантів, що пережили тести з Task B:

| Група | К-сть | Що це | Що зробили |
|---|---|---|---|
| **Повернення `''` у `formatDateUa`** (`format.js:45`, `:47`) | 3 | Порожня чи нерозпізнана дата дала б клієнтові `NaN.NaN.NaN` або сміття. Функція з'явилась у Task C без власного тесту, а в усіх 36 рахунків є обидві дати, тож гілки `return ''` не виконувались ніколи | **Убито** |
| **Суфікс `'T00:00:00Z'` у `toDate`** (`format.js:20`) | 1 | Без нього `'2026-3-9'` V8 читає як локальну північ: замість `''` виходить дата, на схід від UTC — на день раніша. Стосується і CSV | **Убито** |
| **«Сьогодні» за замовчуванням** (`nightly-export.js:12`, `send-reminders.js:12`) | 2 | Без `.slice(0, 10)` ім'я файлу стає `oblik-2026-10-05T11:42:07.123Z.csv`. Ім'я — частина контракту з «Облік-Плюс» (`docs/integrations/oblik-plus.md:11`) і з релеєм. Тести передавали дату, а `npm run export` і `npm run reminders` (`package.json`) — ні | **Убито** |
| **Клієнт без email чи імені** (`reminders.js:33`, `:64`) | 5 | Email необов'язковий (`lib/customers/validate.js:77-78`), а `contact_name` без значення стає `''` (`lib/customers/index.js:92`), тож у проді такі клієнти є, а у фікстурах — ні. Мутант дає релею файл із `To: undefined` чи лист «undefined,» | **Убито** |
| Еквівалентні | 4 | `if (!value) return ''` → `false` (`format.js:35`, `:45`): для будь-якого falsy-значення `toDate` дає Invalid Date, і `''` повертає перевірка `isNaN`. `'utf8'` → `''` у `writeFileSync` (`nightly-export.js:25`, `send-reminders.js:25`): байти ті самі (перевірено) | Вбити неможливо |
| `'T00:00:00Z'` → `''` у `daysBetween` (`reminders.js:9-10`) | 2 | Вбиваються лише дивною датою: пробіл чи час у даті з CLI (`"2026-03-13 "`: 0 листів замість 3) або `due_at` без нулів. Це розклад нагадувань, не формат дат | Свідомо не вбивали |
| Фільтр статусів (`reminders.js:19`) | 4 | Чернетки ловить засіяний `test/reminders.test.js` | Уже вбиті повним `npm test` |
| Поза BILL-482 | 39 | Список нижче | Не вбивали |

Ці 39 — гілки, до яких не доходять фікстури:
- **`esc()` у `render.js:10-14` (9).** У фікстурах немає `& < > "`, а маршрут `/invoices/:number` публічний
  (`app/AGENTS.md`): зламане `esc()` — це XSS, якого жоден тест не помітить. **Найважливіший — для окремого тікета.**
- **Фільтр `paid` / `cancelled` у `reminders.js:19` (6):** у єдиний день еталона (2026-03-13) жоден оплачений чи
  скасований рахунок не стоїть за 3 дні до терміну.
- **Рахунок без рядків, клієнта чи ЄДРПОУ** (`render.js:33,40,41` — 4; `accounting.js:20-21` — 2).
- **Невідомий тип колонки** (`accounting.js:31-32`, 4): без перевірки експорт однаково падає, лише з `TypeError`.
- **Помилки** читання сховища в `bin/` (6) і CLI `render-invoice.js` (8).

**Що це каже про тести:**
- Golden master фіксує рівно те, до чого доходять фікстури. Решту тести не фіксують, і вона не обов'язково нешкідлива:
  листи без email і `esc()` — шляхи, які в проді бувають.
- На шляху дат вижили лише 4 еквівалентні мутанти і 2 в `daysBetween`, яких вбиває лише дивна дата.
- До Task B файл для «Облік-Плюс» не захищав жоден тест (0 із 48) — кількісне підтвердження `docs/impact.md`, розділ 3.

## Ручні мутанти

Stryker міняє оператори й літерали, але не підставляє інший форматер і не чіпає файлів поза `mutate`. Перевірили
руками в копії `app/` проти характеризаційних тестів:
- **Спіймано:** `formatDateUa` ↔ `formatDate` у `render.js`, у кожному тілі листа й в `accounting.js`; тип колонки
  `DateUa` чи `Percent` у `config/export-columns.json`; видалений експорт; `getUTCDate` → `getDate`; `Date` за
  місцевим часом; `дд.мм.рррр` в імені листа; LF замість CRLF у CSV; місцева дата замість UTC у `bin/`.
- **Не спіймав жоден із 131 тестів:** `formatDateUa` у `/api/invoices` (`lib/invoices/routes.js:15`). JSON API читають
  машини, дати там мають лишатися ISO (`app/AGENTS.md`). Додали `api-dates.test.js`.

## Що додали, щоб їх убити

6 тестів, зелені на незміненому коді:

| Тест | Убиває |
|---|---|
| `test/characterization/format-date.test.js:58` — `formatDateUa: empty or unparsable input -> empty string` | `format.js:45:22`, `:47:7`, `:47:34` |
| `test/characterization/format-date.test.js:64` — `formatDate, formatDateUa: a date that is not zero-padded is unparsable` | `format.js:20:48`, `:47:7`, `:47:34` |
| `test/characterization/oblik-export.test.js:105` — `without a date, as npm run export calls it, …` | `nightly-export.js:12:32`; місцева дата замість UTC |
| `test/characterization/reminder-mails.test.js:119` — `without a date, as npm run reminders calls it, …` | `send-reminders.js:12:32`; місцева дата замість UTC |
| `test/characterization/reminder-mails.test.js:138` — `no email or no customer -> no file for the relay; …` | `reminders.js:33` (3), `:64` (2) |
| `test/characterization/api-dates.test.js:40` — `GET /api/invoices and /api/invoices/:id return the stored YYYY-MM-DD dates` | `formatDateUa` в `routes.js:15` |

- **Повторний прогін:** убито рівно 11 мутантів, які пережили Task B, жоден раніше вбитий не вижив. `npm test` →
  133/133.
- **Тести без дати** запускають скрипт у часовому поясі, де місцева дата ніколи не збігається з UTC, і приймають
  дату до й після запуску (на випадок півночі за UTC). Тест листів вимагає хоча б один лист.
- **Залишкові ризики (окремі тікети):**
  - `esc()` — тест із `<script>` у назві клієнта;
  - гроші й текст у CSV: загублений мінус у `formatDecimal` переживає всі 133 тести, мутантів `formatText` ловить лише
    засіяний `test/format.test.js` — потрібен CSV-тест із синтетичним рядком (від'ємна сума, без ПДВ, `;` у назві);
  - тип `DateUa`, вписаний у `config/export-columns.json` у проді, оминає і тести, і перевірку в `accounting.js` —
    потрібен перелік дозволених типів.
- Як ці прогалини з'явились — `docs/ai-on-legacy.md`, випадок 5.
