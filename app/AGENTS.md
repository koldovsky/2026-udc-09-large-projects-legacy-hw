# Billing knowledge for the next agent

- Run `npm test` here; CommonJS, callbacks, built-in Node APIs, no install needed.
- `lib/format.js`: `formatDate` is the US accounting contract; use `formatCustomerDate` for customer HTML/reminders.
- `lib/export/accounting.js` calls `format['format' + col.type]`; `config/export-columns.json` maps both `DocDate` and `PayUntil` to `Date`.
- Accounting silently skips incompatible dates according to `docs/integrations/oblik-plus.md`; seeded tests originally missed this boundary, so keep the full-byte CSV tests in `test/date-contracts.test.js`.
- Preserve CSV UTF-8, semicolon delimiter, CRLF, US dates and decimal-point amounts; changing only visible invoice dates must never alter these bytes.
- `docs/ARCHITECTURE.md` is obsolete: current HTTP uses `http`/`lib/http/router.js`, storage uses JSON `lib/store.js`, port defaults to 8080, invoices use string HTML `lib/invoices/render.js`.
- `formatDate` formerly claimed ISO in JSDoc despite returning US dates; source/tests outrank old comments.
- `lib/reports/dates.js` and `lib/reports/table.js` have separate formatting; raw API/storage dates stay ISO and money stays integer kopecks.
- `bin/send-reminders.js` writes an outbox for a relay; it does not directly call SMTP or persist reminder flags.
- `lib/legacy/pdf-client.js` is not in the active invoice path; `lib/discounts` is unhooked even if its feature flag changes.
- Do not run `bin/fix-2022-duplicate-customers.js --apply` or historical migration against the fixtures.
- Tests that save data must use temporary directories via `store.open(dir)`; never modify shared `data/*.json`.
- Golden fixtures under `test/fixtures` are exact bytes; update human date expectations only after classifying failures in `../docs/impact.md`.
