# Codebase map — Task A

## 1. Method and navigation cost

- Tool: Codex desktop, primary agent; model version and token counter are not exposed.
- Request: complete the homework using `docs/walkthrough.md`, without pushing.
- Mapping used file inventory, targeted `rg` searches, full reads of relevant modules and call-path verification; it did not read every source file.
- Before writing this map: 11 shell calls, including baseline/test execution and Git setup; one failed sandboxed branch creation was retried successfully with elevated filesystem access.
- Full reads covered 34 distinct files: root instructions, walkthrough, ticket; four document templates; package, app README, architecture and integration notes; server, store, format; invoice render/routes/index, reminders, accounting; three configs; six bin scripts; three seeded test files; discounts/index, audit/retention and reports/dates.
- Additional partial reads/searches covered router, report dates/table/index/routes, customer/catalog/order/payment/audit modules and legacy headers; search hits are not counted as full reads.
- Token usage is unavailable; file and shell-call counts are provided instead.

## 2. Verified map

### Entry points

| Entry | Behavior | File |
|---|---|---|
| HTTP | Native Node HTTP server, seven route modules, `/health`; configured port 8080, `PORT` override | `app/server.js` |
| Invoice CLI | Invoice number → HTML on stdout | `app/bin/render-invoice.js` |
| Nightly export | CSV under `out/export/`; 02:30 schedule described in source | `app/bin/nightly-export.js` |
| Reminders | Text files under `out/mail/`; working-day 09:00 schedule described in source | `app/bin/send-reminders.js` |
| Monthly report | Previous/given month, text or JSON stdout; first-of-month cron described in source | `app/bin/monthly-report.js` |
| Bank import | Fixed-width file → plan; writes only with `--apply`; former cron now manual according to source | `app/bin/import-statement.js` |
| Audit retention | Archive old JSONL entries, default 365 days; 03:10 cron described in source | `app/lib/audit/retention.js` |
| Historical utilities | Applied duplicate-customer repair and Mongo migration; do not run against fixtures | `app/bin/fix-2022-duplicate-customers.js`, `app/lib/legacy/mongo-migrate.js` |

Schedules are repository claims; the deployed crontab and remote pickup service are unavailable for verification.

### Modules

| Module | Responsibility | Runtime status |
|---|---|---|
| `lib/http/router` | Route matching, request body parsing, response/error serialization | Active |
| `lib/store` | Lazy cached JSON collections, callback CRUD and explicit save | Active |
| `lib/customers` | Validation/search, cards, activation, open-invoice safety checks, merge planning | Active; merge helper is a planner |
| `lib/catalog` | Products, price lists/history/import, stock alerts | Active |
| `lib/orders` | Lines, totals, numbering, lifecycle transitions | Active |
| `lib/invoices` | Issue confirmed orders, VAT totals, due dates, JSON endpoints and HTML | Active |
| `lib/payments` | KB-2 bank statement parsing, matching/allocation, apply plan | Active |
| `lib/notifications/reminders` | Upcoming/overdue eligibility and customer text | Active via CLI |
| `lib/export/accounting` | Config-driven semicolon CSV | Active via nightly CLI |
| `lib/reports` | Revenue, aging, customer ranking, VAT, independent date/table rendering | Active via HTTP/CLI |
| `lib/audit` | Masked append-only history, query and retention | Active |
| `lib/format` | Shared date, human money, decimal, text and percent helpers | Active |
| `lib/discounts` | Historical loyalty calculations; not wired into invoicing | Dormant in production entry graph; tested |
| `lib/legacy/templates`, `pdf-client` | Old template compiler and PDF service client | No active invoice path; template unit tests still run |
| `lib/legacy/mongo-migrate` | One-off Mongo export conversion | Historical CLI, not server storage |

### Data and formatting

`app/data/*.json` stores synthetic collections, including stock and price history; missing collections read as empty arrays.
`store.open(dir)` resets cache and redirects storage; `save()` writes JSON explicitly.
Business dates use `YYYY-MM-DD`; money uses integer kopecks; audit timestamps use ISO instants in JSONL under `out/`.
Before BILL-482, `lib/format.formatDate` returns UTC `MM/DD/YYYY`, despite its ISO JSDoc.
The completed ticket adds an explicit customer formatter for `DD.MM.YYYY`; accounting retains the old helper.
Human money is `1 234,50 грн`, machine amounts are `1234.50`.
Reports have separate month/date helpers and fixed-width amount rendering; customers, discounts, bank CLI and legacy templates also contain local amount/date helpers.

### Integration boundaries

- Accounting consumes UTF-8 CSV with `;`, CRLF, US dates, decimal points and sanitized text; configured `Date` columns dispatch dynamically to `formatDate`.
- Reminder CLI writes outbox text for a relay; no direct SMTP client is called by this entry point.
- Bank KB-2 input is parsed locally; there is no live bank API in that path.
- HTTP JSON endpoints retain ISO dates and integer money.
- Historical PDF client contains HTTP requests, but current invoice rendering does not call it.

## 3. Evidence checks

Paths and line numbers refer to the baseline unless stated otherwise.

| # | Claim checked | Result | Evidence |
|---|---|---|---|
| 1 | Architecture says Express runs the server | ❌ | `app/server.js:5` requires built-in `http`; `:36` creates server |
| 2 | Architecture says MongoDB is current storage | ❌ | `app/lib/store.js:14` sets data directory; `:28` reads JSON; `:113` saves |
| 3 | Architecture says Handlebars/templates render current invoices | ❌ | `app/lib/invoices/render.js:32` builds strings; `app/lib/invoices/routes.js:35` calls it |
| 4 | Architecture says runtime port is 3000 | ❌ | `app/config/default.json:7` has 8080; `app/server.js:42` allows `PORT` |
| 5 | Architecture says Node 8+ and installation required | ❌ | `app/package.json` declares Node >=22 with no dependencies; `npm test` works without install |
| 6 | All outgoing dates are ISO | ❌ | `app/lib/format.js:33` emits month/day/year; baseline golden CSV confirms |
| 7 | Date formatter's ISO return JSDoc is accurate | ❌ | `app/lib/format.js:27` conflicts with `:33`; characterization test pins actual output |
| 8 | Accounting uses the date formatter indirectly | ✅ | `app/lib/export/accounting.js:32`; `app/config/export-columns.json:3` and `:4` select `Date` |
| 9 | Accounting CSV has CRLF and semicolons | ✅ | `app/lib/export/accounting.js:12`, `:13`, `:67`; full-byte golden tests |
| 10 | Money has distinct human/machine representations | ✅ | `app/lib/format.js:40`, `:54`; seeded `app/test/format.test.js` |
| 11 | Reminders have upcoming and overdue branches | ✅ | `app/lib/notifications/reminders.js:18`, `:37`, `:43`; both golden tests |
| 12 | Invoice JSON dates bypass display formatting | ✅ | `app/lib/invoices/routes.js:15`, `:26`; only HTML handler calls renderer |
| 13 | Current invoices apply loyalty discounts | ❌ | `app/lib/invoices/index.js:53` uses totals directly; no discounts import; `rg -n discounts app/lib app/bin` |
| 14 | Reminder CLI directly sends SMTP | ❌ | `app/bin/send-reminders.js:29` writes files; `rg -n 'smtp\|SMTP\|writeFile' app/bin/send-reminders.js` |
| 15 | Reports share the invoice date formatter | ❌ | `app/lib/reports/render.js:7` imports local dates; `rg -n 'require.*format' app/lib` finds only three production consumers |
| 16 | Historical PDF module is the current renderer | ❌ | `rg -n 'pdf-client\|legacy/templates' app/server.js app/lib app/bin` finds no active importer of PDF client |

## 4. Verification scope

The primary run made no unsupported architecture assertions; the checks deliberately challenged old architecture, misleading JSDoc, dynamic dispatch and dormant modules.
Source verifies file generation and contracts, while external operational behavior (including silent CSV rejection) remains documented integration knowledge, not an observed remote execution.
