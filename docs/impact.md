# BILL-482 impact — Tasks B and C

## 1. Intended change

Show `DD.MM.YYYY` on customer invoices and both payment reminder variants.
Preserve accounting's `MM/DD/YYYY` contract and all ISO storage/API/calculation dates.

## 2. Consumers of the shared date formatter

| Consumer | Call path | Reader | Required result |
|---|---|---|---|
| Invoice HTML issue/due dates | `lib/invoices/render.js` → direct `formatDate` calls | Customer | Both become Ukrainian dates |
| Invoice HTTP page | `GET /invoices/:number` → `lib/invoices/routes.js` → renderer | Customer | Same HTML change |
| Invoice CLI | `bin/render-invoice.js` → renderer → helper | Customer viewing generated HTML | Same HTML change |
| Upcoming reminder text | `bin/send-reminders.js` → `buildReminders` → `body` upcoming branch → helper | Customer; relay transports the text | Due date becomes Ukrainian; headers, file names, eligibility unchanged |
| Overdue reminder text | Same path, overdue branch | Customer; relay transports the text | Due date becomes Ukrainian; other content unchanged |
| Accounting DocDate | `bin/nightly-export.js` → `buildAccountingFile` → `cell` → `format['format' + col.type]`, configured `Date` | Облік-Плюс importer | Preserve US date bytes |
| Accounting PayUntil | Same dynamic lookup, configured due-date column | Облік-Плюс importer | Preserve US date bytes |

The two CSV columns are the hidden consumer: searching only for `formatDate` does not find them.
`app/docs/integrations/oblik-plus.md` documents silent row skipping on incompatible dates; changing this contract can lose accounting records despite green seeded tests.

Outside this call graph: invoice/customer/order/payment JSON, date arithmetic, report text/JSON, audit JSONL, file-name ISO dates, legacy template helpers and dormant discounts use raw ISO values or independent helpers.
No changes are required there.

## 3. Discovery

Used `rg --files`, `rg -n 'formatDate|require\(.*format|legacy/|pdf-client|templates' app --glob '*.js'`, broader date/export/config searches, and reads of every formatter importer and entry script.
Following `format` object usage into `cell()` and `export-columns.json` exposed dynamic date dispatch.
The architecture document was checked against executable imports rather than accepted as current.

## 4. Characterization before implementation

`app/test/date-contracts.test.js` and its fixtures were added before any production edits.
Golden outputs were generated once from the unchanged code, then inspected; tests read static fixtures and never regenerate them.

| Test | Pinned contract | Baseline |
|---|---|---|
| Legacy date helper | UTC, padding, leap date, timestamp slicing, Date inputs, invalid/empty values | Green |
| Complete invoice HTML | Issue/due dates, escaping, lines, VAT, money | Green |
| Complete upcoming reminder | Recipient, subject, text, due date, invoice ID/kind | Green |
| Complete overdue reminder | Same, overdue wording | Green |
| Accounting complete bytes | Both date columns, CRLF, header/order, decimals, text sanitizing, draft exclusion | Green |
| Accounting missing fields | Missing customer and blank dates | Green |
| Invoice CLI | Full seeded invoice stdout | Green |
| Invoice HTTP handler | Full seeded invoice HTML and status without listening | Green |

Baseline: 106/106 seeded tests; after characterization: 114/114, with `app/lib/` unchanged.
The separate commit titled `test: characterize BILL-482 date consumers before implementation` contains these tests and this pre-change analysis; its hash is recorded below after commit creation.

## 5. Post-change review

Pending implementation; accounting fixtures and the legacy helper contract must remain unchanged.
