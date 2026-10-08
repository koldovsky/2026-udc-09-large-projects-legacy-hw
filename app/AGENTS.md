# AGENTS.md — `app/` (prykladpostach-billing)

Read this **before** changing anything. Everything here was checked against the
code, not copied from `docs/`.

## Do not trust `docs/ARCHITECTURE.md`

It is from 2019 and wrong in several places: there is no Express (custom router,
`lib/http/router.js`), no MongoDB (JSON files in `data/`, `lib/store.js`), no
Handlebars templates (`templates/` does not exist; `lib/invoices/render.js`
builds HTML from strings), no `lib/mail` or `lib/export/csv.js`, port is 8080 and
Node is 22+. Read the code. `docs/integrations/oblik-plus.md` is accurate.

## Contract with accounting (Облік-Плюс) — the one that can break silently

`bin/nightly-export.js` writes `out/export/oblik-YYYY-MM-DD.csv`; accounting's
server imports it at 06:00. Required: `;` separator, CRLF, **dates `MM/DD/YYYY`**,
amounts `1234.50`. A row with any other date format is **skipped without an
error on either side** (40 invoices vanished in Feb 2021). Changing the format
needs a week's warning to accounting.

## Dates: two formatters, two audiences

`lib/format.js`:
- `formatDate` → `MM/DD/YYYY`. **Machine format.** Its only caller is the export.
- `formatDateUk` → `DD.MM.YYYY`. **For people** (HTML invoice, reminder mails).

New code that shows a date to a person uses `formatDateUk`. Do not change
`formatDate`'s output, and do not "unify" the two.

## The consumer that grep misses

`lib/export/accounting.js:30` calls `format['format' + col.type]`; the type comes
from `config/export-columns.json` (`"type": "Date"`, `"Decimal"`, `"Text"`). So
**every function in `format.js` is reachable by name from config.** Searching for
`formatDate` finds nothing there. Renaming a helper in `format.js`, or editing a
column `type`, changes accounting's file. `oblik-plus.md` says "do not change
column types" for this reason.

## Pinned by tests

`test/characterization.test.js` + `test/golden/` freeze the HTML invoice, both
reminder mails and the whole accounting CSV (byte for byte, CRLF included).
Before touching `format.js`, `invoices/render.js`, `notifications/reminders.js`,
`export/accounting.js` or `config/export-columns.json`, run `npm test`. If the
**CSV** golden goes red, that is a regression, not an update. Regenerate a golden
only deliberately: `GOLDEN_WRITE=1 node --test test/characterization.test.js`.
Golden files have `-text` in `.gitattributes`: keep them that way on Windows.

## Dead code — safe to ignore, not to extend

- `lib/discounts/` — feature flag `loyaltyDiscounts: false` in
  `config/features.json`; required only by its tests.
- `lib/legacy/templates.js`, `lib/legacy/pdf-client.js` — the PDF service and
  `templates/` were removed in 2020.
- `lib/legacy/mongo-migrate.js`, `bin/fix-2022-duplicate-customers.js` —
  one-offs, **already applied. Do not run them.**

## Other facts

- Data is stored as `YYYY-MM-DD` strings and integer kopecks. The JSON API and
  reports (`lib/reports/dates.js`) output ISO; they do not use `formatDate*`.
- Everything is CommonJS with callbacks (`lib/store.js` says to keep it so).
- `bin/*` write to `out/` (git-ignored). `data/*.json` are test fixtures: tests
  and `store.save` must not rewrite them.
- Source files use CRLF on Windows checkouts; keep line endings when editing
  (a `sed -i` can rewrite the whole file and bloat the diff).
- Two caveats from reading rather than running: `lib/audit/` appears never to be
  written to (no `audit.record` calls in `lib/` or `bin/`), and `customers`,
  `orders`, `catalog`, `payments` were not read in depth.
