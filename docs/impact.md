# Impact analysis — BILL-482

> Sections 1-4 are Task B, written before the code change; their line references are to commit
> `9435413`. Section 5 is Task C, written after the change.

## 1. What changes

BILL-482 asks for the dates customers see on invoices in `DD.MM.YYYY` instead of `MM/DD/YYYY`.
Today these dates come from one shared function, `formatDate` in `app/lib/format.js:29-34`,
which returns `MM/DD/YYYY` (its doc comment at `:27` says ISO; the code disagrees). The same
function also writes the dates in the accounting export, which must not change. Changing
`formatDate` itself changes all three consumers below.

The export cannot be moved off `formatDate` in config: it reaches the function through the
column type `Date`, and the column types must not change (`app/docs/integrations/oblik-plus.md:12-13`).
So the new format has to reach the invoice page and the reminder mails without changing what
`format.formatDate(value)` returns.

## 2. Who depends on it

| # | Consumer (file) | How it reaches `formatDate` | Who reads the result | What must happen after the ticket |
|---|---|---|---|---|
| 1 | Invoice HTML: `app/lib/invoices/render.js:38-39` (issue date and due date) | Direct call `format.formatDate(...)`. Served by `GET /invoices/:number` (`app/lib/invoices/routes.js:34`, `:63`; no staff auth) and printed by `app/bin/render-invoice.js:22` | People: customers open the invoice page. The ticket names this page | Change to `DD.MM.YYYY` |
| 2 | Payment reminder emails: `app/lib/notifications/reminders.js:40` (overdue), `:46` (upcoming); due date only | Direct call `format.formatDate(...)`. `app/bin/send-reminders.js:20` (cron 09:00 on working days) writes the mails to `out/mail/`, and the SMTP relay sends them (`app/bin/send-reminders.js:3-4`) | People: customers. The ticket names these mails and quotes their "pay by 03/12/2026" line | Change to `DD.MM.YYYY` |
| 3 | Oblik-Plus accounting CSV: `app/lib/export/accounting.js:30`, columns `DocDate` and `PayUntil` | **Indirect, the function name does not appear:** `format['format' + col.type]`, with `"type": "Date"` for `issued_at` and `due_at` in `app/config/export-columns.json:3-4`. Run by `app/bin/nightly-export.js:25` (cron 02:30), output `out/export/oblik-YYYY-MM-DD.csv` | Another system: Oblik-Plus imports the file at 06:00 (`app/bin/nightly-export.js:4`, `app/docs/integrations/oblik-plus.md:5-6`) | **Stay `MM/DD/YYYY`, byte for byte.** Oblik-Plus requires `MM/DD/YYYY` (`app/docs/integrations/oblik-plus.md:23`) and silently skips a row with any other date format (`:29-35`; in February 2021 this lost 40 invoices). Column types must not be changed (`:12-13`), so the fix cannot re-type these two columns in the config |

### Checked and not affected

These outputs contain dates but do not go through `formatDate`. They keep their current output
after the ticket.

- `/api/*` JSON, read by the old admin UI (`app/lib/customers/index.js:31`) and the BI
  spreadsheet (`app/lib/reports/render.js:2-3`): dates as stored, `YYYY-MM-DD`
  (for example `app/lib/invoices/routes.js:15`). No `/api/*` response passes through
  `lib/format.js` (`docs/codebase-map.md`, section 2).
- Report text (`app/bin/monthly-report.js`, `GET /api/reports/*?format=text`): the aging table
  prints `issued_at` and `due_at` as stored (`app/lib/reports/render.js:45-46`); periods use
  month names from `app/lib/reports/dates.js:50-54`. `lib/reports/` does not require
  `lib/format.js`.
- `dmy` in `app/lib/legacy/templates.js` (`DD.MM.YYYY`): dead code. Its only importer is
  `app/lib/legacy/pdf-client.js:16`, which nothing requires.
- The reminder subject and the outbox file header (`app/bin/send-reminders.js:24-25`) contain
  no formatted date; the file name uses the ISO run date.

## 3. How they were found

1. **Search by name.** `grep -rn "formatDate" app` finds 4 call sites in 2 files:
   `lib/invoices/render.js:38-39` and `lib/notifications/reminders.js:40`, `:46`. It does not
   find consumer 3.
2. **Search by import.** `formatDate` is defined only in `lib/format.js`, so every caller must
   require that module. `grep -rnE "require\([^)]*format[^)]*\)" lib bin server.js` returns
   three modules: `invoices/render.js:7`, `export/accounting.js:9` and
   `notifications/reminders.js:4`. `export/accounting.js` was missing from step 1; reading it
   showed the lookup by type at `:30`.
3. **Search for dynamic lookups.** `grep -rnE "format\[|'format' *\+" lib bin server.js`
   returns only `export/accounting.js:30`. `grep -rn '"Date"' config` returns the two columns
   in `config/export-columns.json:3-4`.
4. **Search for computed requires.** `grep -rnE "require\( *[^'\" ]" lib bin server.js`
   returns only `server.js:24`, which loads the seven route modules listed at
   `server.js:10-18`. None of them is `lib/format.js`.
5. **Up from each consumer to its entry points.**
   `grep -rnE "renderInvoiceHtml|buildReminders|buildAccountingFile" lib bin server.js`
   returns the invoice route and the three `bin/` scripts named in section 2, and nothing else.
6. **Who reads each output.** This is not in the code. It comes from the ticket, the
   comments in `bin/nightly-export.js:4` and `bin/send-reminders.js:3-4`, and
   `app/docs/integrations/oblik-plus.md`. Where the system's own docs disagree,
   `oblik-plus.md` was trusted over `app/docs/ARCHITECTURE.md`. `ARCHITECTURE.md` (v2.0, May
   2019) says accounting fetches the CSV by hand (`:30`) and names a `lib/export/csv.js` that
   does not exist (`:22`). `oblik-plus.md` was written in March 2021, after the February import
   incident (`:3`), and agrees with the code: `lib/export/accounting.js:3` points to it, and
   `bin/nightly-export.js:4` gives the same 06:00 pickup. The `MM/DD/YYYY` requirement does not
   rest on the document alone: it is the format the export writes today, so keeping the file
   byte for byte is safe whichever document is right.

The search is complete: all three modules that require `lib/format.js` were read in full,
and every function in them that calls `formatDate` was traced to its entry points. The
Task A map had already reported consumer 3 (`docs/codebase-map.md`, claim 2).

## 4. Characterization tests

All eight tests are in `app/test/bill-482-characterization.test.js` and compare against three
golden files in `app/test/golden/`. The first four call `formatDate` and each consumer directly,
so a red test names the module that changed. The last four run the real entry points (the HTTP
route and the three `bin/` scripts) against the same golden files, so a change in the wiring
between a consumer and its reader is caught too. The two cron scripts write under `out/` next to
their own `bin/`, so those tests run them in a temporary copy of `bin/`, `lib/`, `config/` and
`data/`; nothing is written to `app/out/` or `app/data/`.

The golden files were captured by running the unchanged code on the fixtures in `app/data/`.
The command below, run from `app/` with the output directory as its last argument, writes the
three files again; on the unchanged code its output is byte-identical to `app/test/golden/`
(checked with `cmp`).

```sh
node -e '
var fs = require("fs");
var path = require("path");
var dir = process.argv[1];
var invoices = require("./data/invoices.json");
var byId = {};
require("./data/customers.json").forEach(function (c) { byId[c.id] = c; });
var inv = invoices.find(function (i) { return i.number === "INV-2026-00007"; });
fs.writeFileSync(path.join(dir, "invoice-INV-2026-00007.html"),
  require("./lib/invoices/render").renderInvoiceHtml(inv, byId[inv.customer_id]));
fs.writeFileSync(path.join(dir, "reminders-2026-03-16.json"),
  JSON.stringify(require("./lib/notifications/reminders").buildReminders(invoices, byId, "2026-03-16"), null, 2) + "\n");
fs.writeFileSync(path.join(dir, "oblik-export.csv"),
  require("./lib/export/accounting").buildAccountingFile(invoices, byId));
' test/golden
```

The command is kept here and not as a script in `app/test/`: `node --test` runs every `.js` file
under `test/`, so a capture script there would rewrite the golden files on each test run.
After the change, the CSV golden file is never captured again: a new CSV is a regression.

| Test | What it pins | Green on unchanged code? |
|---|---|---|
| `formatDate prints MM/DD/YYYY in UTC, and nothing for empty or invalid input` | The shared function: `MM/DD/YYYY` for a date string, a date-time string and a `Date`; an empty string for empty or invalid input. No seeded test covered `formatDate` | Yes |
| `invoice HTML (renderInvoiceHtml, behind GET /invoices/:number and bin/render-invoice.js) matches the golden file` | The full page for `INV-2026-00007` (`golden/invoice-INV-2026-00007.html`), dates `03/07/2026` and `03/21/2026`, from the renderer itself | Yes |
| `reminder mails for 2026-03-16 (bin/send-reminders.js) match the golden file` | All 8 mails built for 2026-03-16 on the fixtures, 2 upcoming and 6 overdue: recipient, subject and full text (`golden/reminders-2026-03-16.json`) | Yes |
| `Oblik-Plus CSV (bin/nightly-export.js) matches the golden file byte for byte` | The whole nightly file for all 36 fixture invoices: header row, `;` separator, CRLF line ends, dates and amounts (`golden/oblik-export.csv`) | Yes |
| `GET /invoices/INV-2026-00007 over HTTP serves the golden invoice page` | The page as a customer receives it: a real server on a free port, status 200, `content-type: text/html; charset=utf-8`, body equal to `golden/invoice-INV-2026-00007.html`. No `x-staff-id` header is sent, because the route is public (`app/lib/http/router.js:101` checks it only for `/api/*`) | Yes |
| `bin/render-invoice.js prints the golden invoice page` | The stdout of the CLI script for `INV-2026-00007` | Yes |
| `bin/send-reminders.js 2026-03-16 writes one outbox file per golden mail` | The outbox the SMTP relay picks up: 8 files, their names (`<date>-<kind>-<invoice id>.txt`) and their full contents (`To:` and `Subject:` headers, then the mail text from the golden file) | Yes |
| `bin/nightly-export.js 2026-03-16 writes the golden Oblik-Plus CSV byte for byte` | The file Oblik-Plus imports, `out/export/oblik-2026-03-16.csv`, read back from disk, so an encoding change or a BOM added by the script also fails | Yes |

`cd app && npm test`: 114 tests, 114 pass (106 seeded and 8 new). The run leaves no `app/out/`
directory behind.

The tests were also checked to fail when the output changes. Each mutant below was applied to a
temporary copy of `app/` outside the repository (`cp -R app <tmp>`, one line edited, `node --test`
run inside the copy). No file in the repository was edited.

| Mutant (one line changed) | Failed | Passed |
|---|---|---|
| `lib/format.js:33` returns `DD.MM.YYYY`: the "one function" fix the ticket suggests | 9: all 8 new tests and the seeded `rendered invoice shows number, customer, dates and totals` (`app/test/invoices.test.js:37`) | 105 |
| `lib/invoices/render.js:38` prints the issue date as `DD.MM.YYYY` without `formatDate` | 4: the three invoice tests (direct, HTTP, CLI) and the same seeded invoice test. The reminder and CSV tests stay green | 110 |
| `bin/nightly-export.js:25` prepends a BOM to the file; `lib/` unchanged | 1: the `bin/nightly-export.js` test. The direct CSV test stays green, which is the reason the entry-point tests exist | 113 |

Under the first mutant no seeded test failed for the CSV, which Oblik-Plus would have skipped
row by row; only the new CSV tests catch that change.

Commit with the tests (before the change): `9435413`

## 5. After the change (Task C)

The change follows section 1: `formatDate` keeps `MM/DD/YYYY`, and the two consumers that
customers read move to a new function.

- `app/lib/format.js`: new `formatDateUa` returns `DD.MM.YYYY`. It takes the same input as
  `formatDate` (a `YYYY-MM-DD` string or a `Date`, read in UTC) and returns an empty string for
  empty or invalid input. The code of `formatDate` is unchanged. Its doc comment said "Format a
  date for display" and ISO; it now says the function writes the Oblik-Plus export date,
  `MM/DD/YYYY`, and that customer dates go through `formatDateUa`. This doc comment is the only
  change the ticket did not ask for. It was changed because the old comment hid the export
  contract: a reader who trusts it sees a display helper with no machine consumer, which is the
  reading behind the "one function" fix.
- `app/lib/invoices/render.js:38-39` and `app/lib/notifications/reminders.js:40`, `:46`:
  `formatDate` replaced by `formatDateUa`. Four calls, no other line in these files.
- `app/lib/export/accounting.js` and `app/config/export-columns.json` are not touched. The
  `Date` column type still resolves to `formatDate`.

Because the export looks up its helper by type, every function exported from `lib/format.js` is
a valid column type, so `DateUa` now is one too. No column uses it, and the column types must not
change (`app/docs/integrations/oblik-plus.md:12-13`). Re-typing a date column to `DateUa` is
caught by the existing tests. With `issued_at` re-typed to `DateUa` in
`app/config/export-columns.json:3` of a temporary copy of `app/` (the method used for the
section 4 mutants), 2 tests failed, both Oblik-Plus CSV tests, and 113 passed.

The alternative was to change `formatDate` itself and keep the export on `MM/DD/YYYY` with a
special case in `accounting.js`. Today's output would be the same, but the change would edit the
Oblik-Plus code path and make the customer format the shared default. A future machine-read
output that calls `formatDate` would then lose rows silently, as in February 2021. With the
chosen change, a future customer page that calls `formatDate` shows a US date, which customers
see and report.

`cd app && npm test` right after the change, before any expectation was updated: 114 tests,
108 pass, 6 fail. The three golden files were then captured again with the section 4 command
into a temporary directory and compared with `app/test/golden/`:

- `oblik-export.csv`: byte-identical (`cmp`). The golden file was not replaced.
- `invoice-INV-2026-00007.html`: two strings differ, `03/07/2026` → `07.03.2026` and
  `03/21/2026` → `21.03.2026`.
- `reminders-2026-03-16.json`: 8 lines differ, one due date in each of the 8 mails (for example
  `03/19/2026` → `19.03.2026`, `02/21/2026` → `21.02.2026`). With the dates masked, the old and
  new files are identical.

Only the invoice and reminder golden files were replaced with the new output.

| Test | Turned red? | Expected (the output was meant to change) or regression? | What was done |
|---|---|---|---|
| `formatDate prints MM/DD/YYYY in UTC, and nothing for empty or invalid input` | No | Not meant to change: `formatDate` feeds the Oblik-Plus CSV | Nothing. The test now guards the export date format |
| `invoice HTML (renderInvoiceHtml, behind GET /invoices/:number and bin/render-invoice.js) matches the golden file` | Yes | Expected. Customers read the invoice page, and the ticket names it. Only the issue and due dates differ | `golden/invoice-INV-2026-00007.html` replaced with the new output |
| `reminder mails for 2026-03-16 (bin/send-reminders.js) match the golden file` | Yes | Expected. Customers read the mails, and the ticket quotes their due date. Only the due date in each mail text differs; recipients, subjects, kinds and invoice ids are the same | `golden/reminders-2026-03-16.json` replaced with the new output |
| `Oblik-Plus CSV (bin/nightly-export.js) matches the golden file byte for byte` | No | Not meant to change: Oblik-Plus reads it | Nothing |
| `GET /invoices/INV-2026-00007 over HTTP serves the golden invoice page` | Yes | Expected. Same page as above, served over HTTP. Status 200 and content type passed; only the body differed | Test unchanged; it reads the replaced golden file |
| `bin/render-invoice.js prints the golden invoice page` | Yes | Expected. Same page as above, printed by the CLI | Test unchanged; it reads the replaced golden file |
| `bin/send-reminders.js 2026-03-16 writes one outbox file per golden mail` | Yes | Expected. Same mails as above, as outbox files; file names and the `To:` and `Subject:` headers are built from unchanged fields | Test unchanged; it reads the replaced golden file |
| `bin/nightly-export.js 2026-03-16 writes the golden Oblik-Plus CSV byte for byte` | No | Not meant to change: this is the file Oblik-Plus imports | Nothing |
| Seeded: `rendered invoice shows number, customer, dates and totals` (`app/test/invoices.test.js:37`) | Yes | Expected. It asserted the invoice dates `03/09/2026` and `03/23/2026` | The two date assertions (`:41-42`) now expect `09.03.2026` and `23.03.2026`. The other three assertions are unchanged |
| New: `formatDateUa: DD.MM.YYYY in UTC, and nothing for empty or invalid input` (`app/test/format.test.js`) | New test | Pins the new function | Added, with the same inputs as the `formatDate` characterization test |

No other seeded test turned red. After the updates: 115 tests, 115 pass (106 seeded, 8
characterization, 1 new for `formatDateUa`). The run leaves no `app/out/` directory behind.
