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
Pre-change commit: `343568a` (`test: characterize BILL-482 date consumers before implementation`).

## 5. Post-change review

Added `formatCustomerDate`, using the same parsing, UTC, padding and empty-value semantics as the existing helper.
Only the invoice renderer and the two reminder branches use it; dynamic accounting dispatch still resolves `formatDate`.

After the production change, before updating expectations, a targeted run reported 14 tests: 8 passed and 6 failed.
Five new characterization tests and one seeded invoice test failed exactly where customer dates changed.

| Test / fixture | Failed? | Classification | Expectation change |
|---|---|---|---|
| Invoice HTML / `invoice.html` | Yes | Intended customer change | `03/09/2026` → `09.03.2026`, `03/12/2026` → `12.03.2026` |
| Upcoming / `upcoming.json` | Yes | Intended customer change | Due date `03/12/2026` → `12.03.2026` |
| Overdue / `overdue.json` | Yes | Intended customer change | Due date `03/12/2026` → `12.03.2026` |
| CLI and HTTP / `seed-invoice.html` | Both | Intended customer change | Seed invoice issue/due dates change order and separator only |
| Seeded `invoices.test.js` | Yes | Intended customer change | HTML issue `09.03.2026`, due `23.03.2026` |
| Legacy helper, both accounting golden tests | No | Machine contracts preserved | No changed expectations |

Human golden files were edited by date-token substitution only, rather than regenerated from the new implementation.
Added a new helper test for UTC rollover, leap date, timestamp strings and invalid/empty inputs.
`.gitattributes` preserves exact golden bytes across Windows checkouts; CSV remains CRLF and reminder JSON remains LF.
Final full-suite result: 115 passed, 0 failed (106 seeded plus 9 added).

## 6. PR review follow-up

The original CLI/HTTP characterizations read the working `app/data` directory, making their seeded golden sensitive to routine customer edits.
Both now write `date-contract-input.json` records into temporary stores and compare against the existing `invoice.html` golden.
The CLI child opens its temporary store through a test-only Node preload; the HTTP handler uses `store.open(dir)` and resets the store afterward.
Each test removes its temporary directory; the obsolete `seed-invoice.html` golden is removed.
These changes preserve complete output coverage without changing production code or shared data.
Validation: all 115 tests pass; the nine date-contract tests also pass with reads from working `app/data` explicitly blocked in both parent and CLI child processes.
The revised control-run instructions were executed from the document: a fresh baseline clone plus the saved patch reproduces the CSV regression while all 106 control tests pass.
