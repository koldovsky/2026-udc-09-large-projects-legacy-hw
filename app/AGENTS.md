# AGENTS.md — prykladpostach-billing

Read this before changing anything in `app/`. It lists what the code does not
tell you. Plain Node 22, CommonJS, callbacks, no npm dependencies. Keep it that
way and keep diffs small.

## Contracts with other systems

- **Oblik Plus (accounting) CSV** — `bin/nightly-export.js` (cron 02:30) →
  `lib/export/accounting.js` → `out/export/oblik-YYYY-MM-DD.csv`. Their server
  picks it up at 06:00.
  - Format: UTF-8, `;`, **CRLF**, header row first, dates **`MM/DD/YYYY`**,
    amounts `1234.50` (no spaces, no «грн»), text without `;` or newlines.
  - **A row in any other format is silently skipped on their side.** No error
    here, no mail from them. In February 2021 this lost 40 invoices for three
    weeks. Details: `docs/integrations/oblik-plus.md`.
  - Column **types** in `config/export-columns.json` must not change. Column order
    may change. Any format change needs a week's notice to accounting
    (`oblik-plus.md`, «Контакти»).
- **Reminder mails** — `bin/send-reminders.js` (cron 09:00, working days)
  writes `out/mail/*.txt` (`To:`/`Subject:` headers + body). The old SMTP relay
  picks them up. Customers read them.
- **Invoice HTML** — `GET /invoices/:number` (no auth) and
  `bin/render-invoice.js`. Customers read it.
- **Bank statements (input)** — fixed-width KB-2, dates `DDMMYYYY`, parsed in
  `lib/payments/statement.js`. Imported manually by `bin/import-statement.js`
  (dry run by default).
- **Auth** — the reverse proxy sets `x-staff-id` after LDAP. `/api/*` without it
  returns 401 (`lib/http/router.js:100-101`). Non-`/api` routes are public.

## Traps

- **Formatters are looked up by name.** `lib/export/accounting.js:30` calls
  `format['format' + col.type]`, so a column type `Date` in
  `config/export-columns.json` means `formatDate`. Grepping for a formatter's
  name misses the export. To find who depends on `lib/format.js`, grep for
  `require('../format')` and check the column types.
- **Machine vs people formatters** in `lib/format.js`. Never change a
  machine one for a display reason. Add a people one instead.
  - `formatDate` → `MM/DD/YYYY`, **machine**, feeds the CSV.
  - `formatDateUk` → `DD.MM.YYYY`, **people**: invoices and reminders (BILL-482).
  - `formatDecimal` → machine; `formatMoney` → people.
- **Other date helpers are separate code paths.** `lib/reports/dates.js` (reports,
  ISO-only, UTC on purpose — DST bug of 2021) and `dmy` in
  `lib/legacy/templates.js` (dead) do not use `lib/format.js`.
- **Seeded tests do not cover the CSV format.** The guard is
  `test/characterization.test.js`. It compares the outputs with golden files in
  `test/golden/` (invoice HTML, reminder mails, `oblik.csv`).
  - `oblik.csv` changing is a regression unless accounting agreed to it.
  - Regenerate only what you meant to change:
    `UPDATE_GOLDEN=1 node --test --test-name-pattern="customer-facing" test/characterization.test.js`.
    A bare `UPDATE_GOLDEN=1` also rewrites `oblik.csv` and hides the regression.
  - `test/golden/.gitattributes` (`* -text`) keeps the CRLF. Do not remove it.
- **Do not run:** `bin/fix-2022-duplicate-customers.js` (applied on prod
  2022-08-09) and `lib/legacy/mongo-migrate.js` (one-off, 2020).
- **Do not edit `data/*.json`**: tests and characterization fixtures read it.
  **Do not commit `out/`.**
- Cron scripts take the date as an argument, so you can run them for a fixed
  day: `node bin/nightly-export.js 2026-03-20`. They write into `out/`.

## Stale documentation

- **`docs/ARCHITECTURE.md` (2019) is wrong**, although `README.md` links to it.
  The real system has:
  - no Express or Handlebars (`lib/http/router.js` replaced Express in 2020);
  - no `templates/` and no MongoDB (`data/*.json` via `lib/store.js`);
  - port **8080**, not 3000, and no `lib/export/csv.js` or `lib/mail`;
  - integrations beyond SMTP, and formatting of human-facing dates in
    `lib/format.js`, not in templates.
- **`docs/integrations/oblik-plus.md` is accurate.** Read it before touching
  anything about dates, amounts or text in exports.
- **Comments that lie:**
  - `lib/audit/routes.js:2-3` says modules write audit entries through
    `audit.record()`. Nothing outside the tests calls it.
  - The «ISO format» JSDoc on `formatDate` was wrong and was fixed in BILL-482.

## Dead code — do not reuse or "fix"

`lib/discounts/` (flag `loyaltyDiscounts: false`, imported by nothing),
`lib/customers/merge.js`, `lib/legacy/*` (PDF service off since 2020-11), flag
`newAgingBuckets` (read by nothing).

## Verify

`npm test` (114 tests). For any change near formatting, check that
`git diff test/golden/oblik.csv` is empty.
