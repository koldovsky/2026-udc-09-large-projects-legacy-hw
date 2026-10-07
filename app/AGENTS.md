# AGENTS.md — billing (`app/`)

Read before changing anything. Plain Node, CommonJS, callbacks, no deps: keep it that way.

## Contracts with other systems (output others parse)

- **Облік-Плюс CSV** ([lib/export/accounting.js](lib/export/accounting.js), cron 02:30 → `out/export/`):
  `;`, CRLF, UTF-8, dates **`MM/DD/YYYY`**, amounts `1234.50`. A row with any other
  date format is **silently skipped** on their side: no error here, no mail from them.
  Spec: [docs/integrations/oblik-plus.md](docs/integrations/oblik-plus.md).
  Accounting needs ≥1 week notice for any format change.
- Cells are formatted by `format['format' + col.type]` with types from
  [config/export-columns.json](config/export-columns.json). **`grep formatDate` does not
  find this consumer.** Any change to `formatDate` / `formatDecimal` / `formatText` in
  [lib/format.js](lib/format.js) changes the export. Pinned byte for byte by
  [test/characterization/](test/characterization/).
- Dates customers read (invoice HTML, reminder mails) use `formatDateUa` (`дд.мм.рррр`,
  BILL-482). Never change `formatDate` for customer-facing output.
- Reminder mails are text files in `out/mail/`; an SMTP relay picks them up.
- Bank statements are KB-2 fixed-width, with positions in **characters**
  ([lib/payments/statement.js](lib/payments/statement.js)). One bad line rejects the whole file.
- Price import is in **hryvnias**, not kopecks ([lib/catalog/price-import.js](lib/catalog/price-import.js)).
- `x-staff-id` comes from the reverse proxy and is required only on `/api/*`.
  `/invoices/:number` is public.

## Traps

- [lib/store.js](lib/store.js): `insert`/`update` change only the in-memory cache. Nothing
  reaches disk without `save(name)`. Rows are shared cached objects: do not mutate them.
- Money is integer kopecks everywhere. There are ~7 local `fmtAmount` and `toIsoDate`
  copies with different output. Most use UTC; `price-import.js` uses **local** time.
- Order status `invoiced` is set only by `POST /api/orders/:id/invoice`
  ([lib/orders/status.js](lib/orders/status.js) `SYSTEM_ONLY`).
- Dead code, not wired anywhere:
  - `lib/discounts/`, `lib/legacy/*`, `lib/customers/merge.js` (tests only);
  - `audit.record()` has no callers, so `out/audit.log` stays empty;
  - `config/features.json` `newAgingBuckets` is never read.
- Never run [bin/fix-2022-duplicate-customers.js](bin/fix-2022-duplicate-customers.js)
  or `lib/legacy/mongo-migrate.js`: both were one-off and are already applied.
- Golden masters: regenerate with `UPDATE_GOLDEN=1 npm test`, then review the diff. Their
  `.gitattributes` (`-text`) keeps the export's CRLF intact.
- Node 24: `node --test <dir>` fails; pass the file path.

## Outdated documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (2019) is wrong almost everywhere. There is
  no Express, Handlebars, MongoDB, pdf-render, `templates/`, `lib/mail` or `lib/export/csv.js`.
  The port is 8080, not 3000. Dates are not "ISO everywhere". There is more than one
  integration besides SMTP.
- [docs/integrations/oblik-plus.md](docs/integrations/oblik-plus.md) is accurate. Trust it.
- The cron schedule is known only from comments in `bin/*.js`. The crontab lives on the old box, not in the repo.
