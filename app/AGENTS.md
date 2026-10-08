# Notes for agents working in `app/`

- `lib/format.js` is a shared formatter. A change to `formatDate()` has
  non-obvious consumers; inspect consumers before changing it.
- `lib/export/accounting.js` chooses a formatter dynamically with
  `format['format' + col.type]`. A text search for `formatDate` alone can
  miss this consumer.
- The «Облік-Плюс» accounting CSV date format is the external contract
  `MM/DD/YYYY`; see `docs/integrations/oblik-plus.md`.
- BILL-482 applies to customer-visible invoice dates. The invoice renderer
  uses `DD.MM.YYYY`; do not globally change a machine-readable export to
  achieve that result.
- Reminders were outside the BILL-482 scope and remain on the shared
  formatter.
- The JSDoc beside shared `formatDate()` does not match its implementation.
  Verify implementation and consumers, not comments alone.
- A cron/import comment does not prove the state of an external cron job.
  This repository has no cron configuration.
