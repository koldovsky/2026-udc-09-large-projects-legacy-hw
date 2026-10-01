# AGENTS.md — prykladpostach-billing

What the code does not say, checked against the code in October 2026 during BILL-482. Where the
code cannot show something (the Oblik-Plus side; the cron schedules, because the crontab is not
in the repository), the line names its source. Comments and `docs/` here are claims, not facts:
several are wrong (see "Out-of-date documentation").

## Before you change anything

- Do not edit `data/*.json`: the tests share these fixtures. Never commit `out/`.
- `npm test` runs `node --test`, which runs **every** `.js` file under `test/`. A helper or
  capture script placed there runs on every test run.
- Keep the legacy style: CommonJS, callbacks, no npm dependencies, no renames for taste.

## Who reads the output

| Output | Read by | Contract |
|---|---|---|
| `out/export/oblik-YYYY-MM-DD.csv` from `bin/nightly-export.js` (cron 02:30) | Oblik-Plus accounting software, picks the file up at 06:00 | UTF-8, `;`, CRLF, header row; dates **`MM/DD/YYYY`**, amounts `1234.50`, text without `;` or line breaks (`docs/integrations/oblik-plus.md:17-25`). A row with another date format is **skipped silently** (`:29-31`). Column types in `config/export-columns.json` must not change (`:12-13`). A format change needs a week's notice to accounting (`:42-43`) |
| Invoice HTML: `GET /invoices/:number`, `bin/render-invoice.js` | Customers | Dates `DD.MM.YYYY` (BILL-482), money `1 234,50` plus the currency suffix |
| `out/mail/*.txt` from `bin/send-reminders.js` (cron 09:00, working days) | The old SMTP relay, then customers | Plain text; due date `DD.MM.YYYY` (BILL-482) |
| `/api/*` JSON | Old admin UI (staff); `/api/reports/*` is also pulled weekly into a BI spreadsheet (`lib/reports/render.js:1-3`) | Dates as stored, `YYYY-MM-DD`. `totals.outstanding` is a plain string such as `"5793.00"`: no spaces, no currency (`lib/customers/index.js:31`, `:221`). Validation messages are shown to staff as-is, in Ukrainian (`lib/customers/validate.js:4-5`). Audit rows render in one table, capped at 500 (`lib/audit/routes.js:11-12`) |
| stdout of `bin/monthly-report.js` (cron 07:00 on the 1st) | Mailed to the director and accounting (`bin/monthly-report.js:9-10`); accounting pastes it into Excel | Fixed width, columns separated by two spaces, no tabs or box-drawing characters (`lib/reports/table.js:5-6`) |
| `x-staff-id` request header | Set by the reverse proxy after LDAP login | Checked only for `/api/*` (`lib/http/router.js:101`); `/invoices/:number` is public |

Inbound: KB-2 bank statements (fixed width, `DDMMYYYY` dates, kopecks; `lib/payments/statement.js`)
and the price file from purchasing (`sku;new_price_hrn[;note]`, hryvnias with a comma or a dot;
`lib/catalog/price-import.js:2-12`).

## Traps

1. **`formatDate` writes the Oblik-Plus date, not a display date.** It returns `MM/DD/YYYY` and
   must keep doing so. Dates that customers see go through `formatDateUa` (`DD.MM.YYYY`); a new
   page or mail for customers must call it.
2. **A search by function name misses callers of `lib/format.js`.** `lib/export/accounting.js:30`
   resolves `format['format' + col.type]` from the types `Date`, `Decimal` and `Text` in
   `config/export-columns.json`. So `formatDecimal` and `formatText` have no caller by name and
   are live, every function exported from `lib/format.js` is a valid column type, and an unknown
   type throws during the nightly export (`:31-33`). To find who depends on a formatter, search
   for `require` of `lib/format.js` and for `format[`, then read those modules in full. Before
   any change to how dates or amounts are formatted, check the Oblik-Plus file first
   (`docs/integrations/oblik-plus.md:37-38`).
3. **A whole group of routes can disappear without an error.** `server.js:23-27` skips a route
   module that throws `MODULE_NOT_FOUND`, also when the missing module is one of its own nested
   `require`s; its routes then answer 404. After touching a `routes.js` or anything it requires,
   call one of its routes.
4. **Amounts have local formatters.** `fmtAmount` exists separately in `lib/reports/table.js`,
   `lib/customers/index.js`, `lib/catalog/price-import.js` and `bin/import-statement.js`, each
   with its own format and reader (table above). Change the one for the output in the ticket,
   not `lib/format.js`.
5. **Time zones.** Stored dates are `YYYY-MM-DD` in UTC, so "today" is still yesterday before
   02:00 Kyiv time in winter and before 03:00 in summer; the comment at
   `lib/customers/index.js:26` gives only 03:00. `lib/catalog/price-import.js:31-34` builds its
   date in local time instead.
6. **Dead and half-dead code.** Do not reuse it or "fix" it as if it ran:
   - `lib/discounts/`: nothing calls it (`lib/discounts/index.js:7-9`), whatever
     `config/features.json` says.
   - `lib/legacy/`: the PDF service was switched off in 2020 (`lib/legacy/pdf-client.js:9`).
     `dmy` (`lib/legacy/templates.js:180`) prints `DD.MM.YYYY`, but nothing reaches it.
   - `audit.record()` (`lib/audit/index.js:114`) is never called, so `GET /api/audit` reads a
     log that nothing writes.
   - The `newAgingBuckets` flag in `config/features.json` is read nowhere.
   - `bin/fix-2022-duplicate-customers.js` was applied in 2022 and must never run again.
7. **No locking.** `lib/store.js:116` rewrites the whole collection file from its in-memory
   cache on every save, so two processes writing the same collection overwrite each other. A
   statement imported twice at the same time already happened once (`lib/payments/index.js:10-12`).

## Out-of-date documentation

- `docs/ARCHITECTURE.md` (v2.0, May 2019), linked from `README.md:6`, is wrong on almost every
  point: no Express (`lib/http/router.js:4`), no MongoDB (JSON files, `lib/store.js`), no
  Handlebars or `templates/`, port 8080 not 3000, no `lib/export/csv.js` or `lib/mail`, and
  accounting does not fetch the CSV by hand. Its line 27 (dates passed on in ISO 8601) is wrong
  for the Oblik-Plus export.
- `docs/integrations/oblik-plus.md` (March 2021) agrees with the code. It is the only source
  for the silent skip and the February 2021 incident; neither can be checked from here.
- `lib/http/router.js:91-93` says every request without `x-staff-id` is rejected; only `/api/*`
  is (`:101`).
- Until BILL-482 the `formatDate` comment said "for display" and "ISO"; both were wrong.

## Tests that guard the contracts

- `test/bill-482-characterization.test.js` pins `formatDate` and the three outputs that use
  `lib/format.js` against `test/golden/`, directly and through the real entry points (the HTTP
  route; the `bin/` scripts in a temporary copy of the app).
- **Never re-capture `test/golden/oblik-export.csv`.** A difference there is a regression.
  Before BILL-482 no test covered this file, so a change to the export date turned nothing red.
- Re-capture the invoice and reminder golden files only when a ticket means to change what
  customers see. From `app/`:

  ```sh
  node bin/render-invoice.js INV-2026-00007 > test/golden/invoice-INV-2026-00007.html
  node -e 'var by = {}; require("./data/customers.json").forEach(function (c) { by[c.id] = c; });
    console.log(JSON.stringify(require("./lib/notifications/reminders").buildReminders(
      require("./data/invoices.json"), by, "2026-03-16"), null, 2))' > test/golden/reminders-2026-03-16.json
  ```
