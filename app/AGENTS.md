# AGENTS.md — prykladpostach-billing

What the code does not say, checked against the code in October 2026 (BILL-482). Comments and
`docs/` here are claims, not facts; several are wrong (see "Out-of-date documentation").

## Before you change anything

- Do not edit `data/*.json`: the tests share these fixtures. Never commit `out/`.
- `npm test` runs every `.js` file under `test/`, so a helper or capture script placed there runs
  on every test run.
- Keep the legacy style: CommonJS, callbacks, no npm dependencies, no renames for taste.

## Who reads the output

| Output | Read by | Contract |
|---|---|---|
| `out/export/oblik-YYYY-MM-DD.csv` from `bin/nightly-export.js` (cron 02:30) | Oblik-Plus accounting software, picks the file up at 06:00 | UTF-8, `;`, CRLF, header row; dates **`MM/DD/YYYY`**, amounts `1234.50`, text without `;` or line breaks (`docs/integrations/oblik-plus.md:17-25`). A row with another date format is **skipped silently** (`:29-31`). Column types must not change (`:12-13`). A format change needs a week's notice to accounting (`:42-43`) |
| Invoice HTML: `GET /invoices/:number`, `bin/render-invoice.js` | Customers | Dates `DD.MM.YYYY` (BILL-482), money `1 234,50` plus the currency suffix |
| `out/mail/*.txt` from `bin/send-reminders.js` (cron 09:00, working days) | The SMTP relay, then customers | Plain text; due date `DD.MM.YYYY` (BILL-482) |
| `/api/*` JSON | Old admin UI (staff); `/api/reports/*` also feeds a weekly BI spreadsheet (`lib/reports/render.js:1-3`) | Dates as stored, `YYYY-MM-DD`. `totals.outstanding` is a plain string such as `"5793.00"` (`lib/customers/index.js:31`, `:221`). Validation messages are shown as-is (`lib/customers/validate.js:4-5`). Audit rows render in one table, capped at 500 (`lib/audit/routes.js:11-12`) |
| stdout of `bin/monthly-report.js` (cron 07:00 on the 1st) | Mailed to the director and accounting (`bin/monthly-report.js:9-10`), pasted into Excel | Fixed width, two spaces between columns, no tabs or box-drawing characters (`lib/reports/table.js:5-6`) |

Inbound: KB-2 bank statements (`lib/payments/statement.js`: fixed width, `DDMMYYYY`, kopecks) and
the purchasing price file (`lib/catalog/price-import.js:2-12`: `sku;new_price_hrn[;note]`,
hryvnias with a comma or a dot). The `x-staff-id` header comes from the LDAP reverse proxy. The
router checks it only for `/api/*`, and only that it is a nonzero number; it does not verify who
sent it (`lib/http/router.js:100-101`). `/invoices/:number` is public.

## Traps

1. **`formatDate` writes the Oblik-Plus date, not a display date.** It must keep returning
   `MM/DD/YYYY`. Customer dates go through `formatDateUa` (`DD.MM.YYYY`); a new page or mail for
   customers must call it.
2. **A search by function name misses callers of `lib/format.js`.**
   `lib/export/accounting.js:30` resolves `format['format' + col.type]` from the types in
   `config/export-columns.json`. So `formatDecimal` and `formatText` have no caller by name and
   are live, and every function exported from `lib/format.js` is a valid column type. To find who
   depends on a formatter, search for `require` of `lib/format.js` and for `format[`, then read
   those modules in full. Before any change to how dates or amounts are formatted, check what it
   does to the Oblik-Plus file, as the integration doc asks
   (`docs/integrations/oblik-plus.md:37-38`).
3. **The tests do not guard the deployed column config.** Column changes for accounting are made
   in `config/export-columns.json` without a deploy (`docs/integrations/oblik-plus.md:12-13`). An
   unknown type stops the export with an error (`lib/export/accounting.js:31-33`), but a type
   that names another formatter (`DateUa`, `Money`, `Percent`) runs and writes the wrong format.
4. **A whole group of routes can disappear without an error.** `server.js:23-27` skips a route
   module that throws `MODULE_NOT_FOUND`, also when the missing module is one of its own nested
   `require`s; its routes then answer 404. After touching a `routes.js` or anything it requires,
   call one of its routes.
5. **Amounts have local formatters.** `fmtAmount` exists separately in `lib/reports/table.js`,
   `lib/customers/index.js`, `lib/catalog/price-import.js` and `bin/import-statement.js`, each
   with its own reader (table above). Change the one for the output in the ticket, not
   `lib/format.js`.
6. **Time zones.** Stored dates are UTC `YYYY-MM-DD`, so "today" is still yesterday before 02:00
   Kyiv time in winter and before 03:00 in summer; the comment at `lib/customers/index.js:26`
   gives only 03:00. `lib/catalog/price-import.js:31-34` builds its date in local time instead.
7. **Dead code.** Do not reuse it or "fix" it as if it ran: `lib/discounts/` (nothing calls it,
   whatever `config/features.json` says; `lib/discounts/index.js:7-9`), `lib/legacy/` (the PDF
   service has been off since 2020; its `dmy` prints `DD.MM.YYYY`, but nothing reaches it),
   `audit.record()` (`lib/audit/index.js:114`, never called, so `GET /api/audit` reads a log
   nothing writes), the `newAgingBuckets` flag (read nowhere) and
   `bin/fix-2022-duplicate-customers.js` (applied in 2022, must never run again).
8. **No locking.** `lib/store.js:116` rewrites the whole collection file on every save, so two
   processes writing the same collection overwrite each other. A statement imported twice at the
   same time already happened once (`lib/payments/index.js:10-12`).

## Out-of-date documentation

- `docs/ARCHITECTURE.md` (May 2019), linked from `README.md:6`, is wrong on almost every point:
  no Express, MongoDB, Handlebars, `templates/`, `lib/export/csv.js` or `lib/mail`; port 8080,
  not 3000; accounting does not fetch the CSV by hand. Its line 27 (dates passed on in ISO 8601)
  is wrong for the Oblik-Plus export.
- `docs/integrations/oblik-plus.md` (March 2021) agrees with the code. It is the only source for
  the silent skip and the February 2021 incident; neither can be checked from here.
- `lib/http/router.js:92-93` says every request without `x-staff-id` is rejected; only `/api/*`
  is (`:101`).

## Tests that guard the contracts

- `test/bill-482-characterization.test.js` pins `formatDate` and the three outputs that use
  `lib/format.js` against `test/golden/`, directly and through the real entry points.
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
