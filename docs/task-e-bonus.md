# Task E — Path 3: retire the ambiguous shared date formatter

This is a release plan; only step 1 belongs to BILL-482.

1. Add explicit `formatCustomerDate` and migrate HTML/reminders, preserving `formatDate` for accounting; release with customer golden tests and unchanged CSV byte tests (implemented here).
2. Add `formatAccountingDate` with the exact existing US behavior, retaining `formatDate` as an alias; release with equality tests for normal, UTC rollover, empty and invalid inputs and unchanged CSV goldens.
3. Add configurable type `AccountingDate` through the existing dynamic lookup, then change only the two date column types in `config/export-columns.json`; release with column-order/type and complete CSV byte tests, including reordered columns.
4. Search direct imports, aliases, computed property access, configs and entry scripts; document every remaining user of `formatDate` and migrate each to an explicit boundary helper in separate releases.
5. After confirming no external/custom configuration uses type `Date`, deprecate and eventually remove the alias; preserve a temporary compatibility alias if consumers cannot be inventoried.

Each release keeps stored/API dates ISO, amount contracts unchanged, and golden accounting output identical.
Coordinate any actual accounting format migration with the importer owner and a sample import; local green tests cannot verify remote acceptance.
