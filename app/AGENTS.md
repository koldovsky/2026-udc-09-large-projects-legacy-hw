# AGENTS.md — prykladpostach-billing

Non-obvious knowledge for the next agent working in this codebase.

## Critical: accounting export uses dynamic dispatch for date formatting

`lib/export/accounting.js:30` calls format functions dynamically:
```js
format['format' + col.type]
```
Column types are in `config/export-columns.json`. A `grep formatDate` will NOT
find this consumer. Any change to `formatDate` silently breaks the nightly CSV
export for Oblik-Plus (the accounting system). Their server drops rows with
wrong date formats without any error — see `docs/integrations/oblik-plus.md`
and the February 2021 incident described there.

**Before changing any format function**, check `config/export-columns.json` for
types that map to it.

## ARCHITECTURE.md is almost entirely wrong

`app/docs/ARCHITECTURE.md` was written in 2019 and describes a system that no
longer exists:

| ARCHITECTURE.md says | Reality (as of 2026) |
|---|---|
| Express | Plain `http` + custom router (`lib/http/router.js`), Express removed in 2020 |
| MongoDB | JSON files in `data/`, loaded by `lib/store.js` |
| Handlebars templates | String concatenation in `lib/invoices/render.js` |
| Port 3000 | Port 8080 (`config/default.json`) |
| Node 8+ | Node 22+ (`package.json`) |
| `npm install` needed | Zero npm dependencies |
| `lib/mail` module | Does not exist; see `lib/notifications/reminders.js` |
| `pdf-render` service | Removed in 2020 |

**Do not trust this document.** Always verify against the code.

## Export format contract with Oblik-Plus

The nightly CSV (`bin/nightly-export.js`, cron 02:30) must produce:
- Dates: `MM/DD/YYYY` (American locale on their server)
- Amounts: decimal with dot separator, no spaces, no currency symbol (`1234.50`)
- Separator: `;`
- Line endings: CRLF
- Encoding: UTF-8

Changing any of these silently loses invoices in their system. Contact: head
accountant Maryna, ext. 214, needs one week notice for import changes.

## Reports have their own date helpers

`lib/reports/dates.js` is a separate set of date utilities (month names in
Ukrainian, `daysBetween`, ISO validation). It does NOT use `lib/format.js`.
Changes to `format.js` do not affect reports.

## Dead modules

- `lib/legacy/` — MongoDB migration (2020), PDF client, old template engine.
  All dead code, not called from anywhere live.
- `lib/discounts/` — loyalty discounts, feature-flagged off since 2023
  (`config/features.json: loyaltyDiscounts: false`), routes unhooked.

## VAT computation

VAT is computed on the subtotal (not per-line) and rounded half-up. This was
requested by accounting in 2018. Do not "fix" to per-line VAT — see comment in
`lib/invoices/index.js:18`.

## Bank statement parser

`lib/payments/statement.js` parses KB-2 fixed-width bank statements. Dates in
the statement are `DDMMYYYY` (no separators), converted to ISO on import.
