# Нотатки агенту для `app/`

- Джерело істини — код, а не `app/docs/ARCHITECTURE.md`: документ має дату травень 2019 і описує Express/MongoDB, яких теперішній застосунок не використовує. Поточний entry point — `server.js`; він підключає тільки модулі з явного списку `MODULES`.
- Не вважай модуль активним лише тому, що файл існує або його імпортує інший legacy-файл. Перевір ланцюжок до `server.js` чи CLI в `bin/`. Зокрема, `lib/legacy/pdf-client.js` і templates не підключені поточними entry points; `lib/legacy/mongo-migrate.js` — одноразова міграція.
- `lib/store.js` працює з JSON у `data/`, тримає callback API, дати зберігає як `YYYY-MM-DD`, гроші — цілими копійками. Не редагуй fixture-файли в `data/` для тестів.
- Контракт дат залежить від споживача. `lib/format.js::formatDate` дає клієнтський `DD.MM.YYYY`; бухгалтерський CSV у `lib/export/accounting.js` має зберігати `MM/DD/YYYY` через `formatDateUs` згідно з `docs/integrations/oblik-plus.md`. Тип `Date` у `config/export-columns.json` проходить спеціальну гілку в `accounting.js`; не повертай його на загальний display formatter.
- Reminder-и записуються як текстові файли в `out/mail/`, які забирає SMTP relay; CSV генерується в `out/export/` для автоматичного імпорту «Облік-Плюс». Це інтеграційні контракти, навіть якщо транспорт не реалізовано бібліотекою SMTP у цьому repo.
- Перш ніж назвати API-поведінку загальною, перевір кожний route handler: результат одного endpoint-а не доводить поведінку інших.
