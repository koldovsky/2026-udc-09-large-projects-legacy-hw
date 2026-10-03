# AGENTS.md — `prykladpostach-billing`

Read this before you touch anything. It is the knowledge that is **not** visible
in the code, and that you would otherwise learn by breaking production.

Plain Node.js, CommonJS, callbacks, **zero npm dependencies**, no build step.
`npm test` runs Node's own test runner. `npm start` → port 8080.
Keep the style: no ESM, no async/await, no new dependencies.

---

## 1. `app/docs/ARCHITECTURE.md` is out of date. Do not use it.

Version 2.0, **May 2019**. Every structural claim in it is now false. Checked
one by one in `../docs/codebase-map.md` §3:

| It says | Reality |
|---|---|
| Express app | own router, `lib/http/router.js`; Express removed 2020 (`router.js:4`) |
| Handlebars, pages rendered from `templates/` | `templates/` does not exist; HTML is string concatenation in `lib/invoices/render.js` |
| Data in MongoDB | JSON files in `data/`, one per collection, via `lib/store.js` |
| `lib/export/csv.js` | it is `lib/export/accounting.js` |
| `lib/mail` for SMTP | no such module; reminders are written as files to `out/mail/` |
| "formatting for humans only in templates" | two independent formatters: `lib/format.js` and `lib/reports/table.js` |
| "external integrations: SMTP only, accounting picks the CSV up by hand" | **false and dangerous — see §2** |
| `npm install`, port 3000, Node 8+, MongoDB 3.6 | no deps, port 8080, Node >= 22, no Mongo |

`app/docs/integrations/oblik-plus.md` **is** current and accurate. Trust that one.

---

## 2. The nightly export is read by a machine, and it fails silently

`out/export/oblik-YYYY-MM-DD.csv` is written by cron at 02:30
(`bin/nightly-export.js`) and **picked up automatically by the «Облік-Плюс»
accounting server at 06:00**. Nobody opens it by hand, whatever
`ARCHITECTURE.md` says.

Its contract (`docs/integrations/oblik-plus.md`): UTF-8, `;` separator, CRLF,
header row first, amounts as `1234.50`, and dates as **`MM/DD/YYYY`** — their
server runs an American locale.

**The failure mode is the point:** a row whose date it cannot parse is **not an
error. It is skipped.** A warning lands in their import log, which nobody reads.
No exception here, no mail from them, green tests. In February 2021 forty
invoices vanished this way and it took three weeks to notice, via a VAT
mismatch.

So: **before changing anything about how dates or amounts are formatted, check
what happens to this file.** `test/export/accounting.test.js` holds a golden
master over all of `data/` — if it goes red, you are about to lose invoices.
Accounting (Марина, ext. 214) needs a week's notice for any real format change.

---

## 3. `lib/export/accounting.js` is invisible to a search for `formatDate`

```js
var render = format['format' + col.type];   // accounting.js:30
```

`col.type` comes from `config/export-columns.json` as the string `"Date"`, so
the call resolves to `format.formatDate` at runtime. There is no token
`formatDate` anywhere in that file.

Consequences, all learned the hard way:

- `grep formatDate` finds **2 of 3** consumers. So do LSP "find references" and
  `ast-grep`. To find consumers of `lib/format.js`, search for the **module**:
  `grep -rn "require(.*format" app --include="*.js"`.
- **Never rename an exported `format*` function.** A rename breaks the export at
  runtime and no test will catch it unless you run `test/export/accounting.test.js`.
  The same applies to adding a column type to `config/export-columns.json`:
  the type must have a matching `format<Type>` export or `cell()` throws.
- Do not change the `type` values in `config/export-columns.json`. Accounting may
  reorder columns without a deploy; the types are the contract.

---

## 4. Which date format goes where (BILL-482)

Three independent date paths. They are not interchangeable:

| Function / place | Format | Audience |
|---|---|---|
| `format.formatDate` | `MM/DD/YYYY` | **machine** — «Облік-Плюс» CSV only. Not for people. |
| `format.formatDateUA` | `DD.MM.YYYY` | **people** — HTML invoice, reminder mails. Use this for anything a customer reads. |
| `lib/reports/*` | raw ISO `YYYY-MM-DD` | report text (people) and report JSON (the BI sheet Олена pulls on Mondays). Does **not** go through `lib/format.js`. |

`formatDate` keeps its misleading name on purpose — see §3. Its JSDoc warns
about this; before BILL-482 that JSDoc claimed it returned "ISO format", which
was never true.

Stored data stays ISO `YYYY-MM-DD` in `data/*.json`, and the JSON API returns it
untouched (`lib/invoices/routes.js`). Do not "normalise" stored dates.

---

## 5. Dead code — leave it alone, do not unify it

- `lib/legacy/templates.js` — hand-written mini-Handlebars. `templates/` was
  deleted in 2020 with the PDF service, so `render()` cannot find a file and
  only `compile()` is exercised, by tests. Its `date` helper (`dmy`) **already**
  produces `DD.MM.YYYY`. Tempting to reuse. Don't: it is unreachable, and merging
  it with the live formatter is a refactor nobody asked for.
- `lib/legacy/pdf-client.js` — `pdf-render` service switched off November 2020.
  Carries a `TODO(2021-03)` to delete it.
- `lib/legacy/mongo-migrate.js` — migration off Mongo, long done.
- `bin/fix-2022-duplicate-customers.js` — one-off, applied on prod 2022-08-09.
  **Do not run it. Do not add it to cron.** Its duplicate list is hand-checked,
  not derived from data, on purpose: some same-ЄДРПОУ "duplicates" are real
  branches.

---

## 6. Traps that cost time

- **`/api/*` needs an `x-staff-id` header**, otherwise 401 (`router.js:101`).
  The reverse proxy sets it after LDAP login. Tests that hit the server must
  send it.
  **`GET /invoices/:number` is not under `/api/`, so the HTML invoice is public**
  — no auth at all. Keep that in mind before putting anything on that page.
- **Money is integer kopecks everywhere.** Never floats. `formatMoney` is for
  people (`1 234,50 грн`), `formatDecimal` for machines (`1234.50`).
- **`lib/store.js` caches collections in memory** and only writes on `save()`.
  `store.open(dir)` resets the cache — that is how tests point it at a temp dir.
  Mutating a row from `find()` mutates the cache; `all()` returns a copy.
- **`config/features.json` is mostly a lie.** Two keys, and neither does what it
  looks like:
  - `loyaltyDiscounts: false` — read only by `lib/discounts/index.js`, and
    **`lib/discounts/` is required by nothing in `lib/` or `bin/`**, only by its
    own two test files (`grep -rln discounts app --include="*.js"`). So the whole
    module is orphaned: flipping the flag to `true` changes no production
    behaviour, it just enables code nothing calls.
  - `newAgingBuckets: true` — **read by nobody at all**
    (`grep -rn newAgingBuckets app` matches only `features.json` itself). A dead
    key. Do not assume flipping it affects the aging report; wire it up first or
    leave it.
- **Dates are parsed UTC-only**, deliberately (`format.js` `toDate`,
  `reports/dates.js`). Never swap a `getUTC*` call for its local-time twin.
  Mutation testing (`../docs/task-e-bonus.md`) showed this is the one change the
  suite used to miss entirely: on a host at a **positive** UTC offset — like
  Kyiv, where this was developed — local-time formatting gives the identical
  answer, so the tests stay green. West of Greenwich the same code shifts every
  date back one day: the invoice says `08.03.2026` and the Облік-Плюс export
  books the invoice on the wrong day. `test/characterization/bill-482-dates.test.js`
  now runs both formatters in a child process under five explicit `TZ` values to
  catch this. **If you work in a negative-offset timezone, run the suite before
  you believe anything about dates.**
- `grep` with `--include` **before** the path silently expands as a glob in zsh
  and reports `no matches found`. An empty search result here is a hypothesis,
  not a fact — confirm it with a search that must match something.

---

## 7. How to verify a change

```bash
cd app && npm test          # 127 tests, all green
```

Then, for anything that touches formatting or invoices:

```bash
node bin/nightly-export.js 2026-03-31
diff out/export/oblik-2026-03-31.csv test/golden/oblik-export.csv   # must be identical
node bin/render-invoice.js INV-2026-00007 | grep 'class="dates"'
node bin/send-reminders.js 2026-03-18
```

Never commit `app/out/` (gitignored). Never edit `app/data/*.json` — the tests
share those fixtures.
