# Task E (bonus) — Path 1: three ways to navigate

Question asked three ways: **who depends on how dates are formatted?** In other words, which
outputs change if the shared date formatter (`formatDate` in `app/lib/format.js`) changes. The
known answer, from `docs/impact.md` section 2, is three consumers: the invoice HTML
(`lib/invoices/render.js:38-39`), the reminder mails (`lib/notifications/reminders.js:40`, `:46`)
and the Oblik-Plus CSV (`lib/export/accounting.js:30`, through the `"Date"` column type in
`config/export-columns.json:3-4`). The third one has no call by name.

## Setup

All three methods ran on the original code, not on this branch. This branch already contains the
answer: `docs/impact.md`, `app/AGENTS.md`, the characterization tests and the new doc comment on
`formatDate` all name the Oblik-Plus export. An agent searching this branch would read the answer
instead of finding it. The original `app/` was extracted from `main` into a temporary directory
outside the repository:

```sh
git archive main app | tar -x -C <tmp>
```

The copy has the system's own `app/docs/` and no course files. Line numbers below are from that
copy, that is, from `main`.

## Results

| Method | What it found | What it did not find | Cost (calls / tokens / time) |
|---|---|---|---|
| Text search (grep) | **By name** (`grep -rn "formatDate" .`): the definition, the export and the 4 calls in `render.js` and `reminders.js`, so consumers 1 and 2. **Search chain** from `docs/impact.md` section 3 (also by `require` of `format`, by `format[`, by `"Date"` in `config/`, by computed `require`): all 3 consumers, including `accounting.js:30` and the two config lines | By name: the Oblik-Plus CSV. Either way: who reads each output, and the entry points (route, `bin/` scripts), which need another search and the docs | By name: 1 call, 584 bytes of output, 0.02 s. Chain: 5 calls, 1,074 bytes in total, under 0.1 s. Not counted: reading the 3 modules that require `lib/format.js`, which is how the chain's patterns were known in the first place |
| Subagent (Explore, breadth "medium", no hints) | All 3 consumers with `file:line`, the lookup through `col.type` and the config, the entry points (`GET /invoices/:number`, `bin/render-invoice.js`, `bin/send-reminders.js`, `bin/nightly-export.js`) with cron times, the readers (customers; Oblik-Plus at 06:00), the Oblik-Plus contract and the February 2021 incident, the test gaps (no test of `formatDate` or of the export), the outputs not affected (`dmy` in `lib/legacy/`, reports, `/api/*` JSON), and the out-of-date `docs/ARCHITECTURE.md:22,30` | No consumer missed. One claim is not supported by the code: that staff "open or save" the invoice page; the route is public and the ticket names customers | 20 tool calls, 46,641 tokens, 77 s. Checking its claims against the code took 2 more calls |
| Semantic tool: LSP "find references" (`typescript-language-server` 4.4.1 with TypeScript 5.9.3, run with `npx`) | **Symbol references** to `formatDate`, asked on the export key (`format.js:77`) or on a call site: the same 4 calls as the search by name. **File references** to `lib/format.js` (tsserver `fileReferences`, VS Code's "Find File References"): the 3 modules that require it, including `accounting.js:9`, plus `test/format.test.js` | The Oblik-Plus CSV as a user of `formatDate`: `format['format' + col.type]` is a string built at run time, so there is no symbol to resolve, and `export-columns.json` is data, not code. Readers and entry points | 16 tool calls, about 3 minutes, under 10 KB of tool output in total. This includes writing a stdio LSP client and finding a timing bug in it. One query takes 1-3 s, mostly server start; once the project is loaded, the query alone takes 20-60 ms |

## Details of the semantic run

The client sent `initialize`, `textDocument/didOpen`, `textDocument/definition` and
`textDocument/references`, and for file references `workspace/executeCommand` with
`typescript.tsserverRequest` and `fileReferences`. Results depend on where and how the question
is asked:

| Query | No `jsconfig.json` (as shipped) | With `jsconfig.json` |
|---|---|---|
| References on `function formatDate` (`format.js:29`) | 2, both in `format.js` | 2, both in `format.js` |
| References on the export key `formatDate:` (`format.js:77`) | 1, the key itself | 5: the key and the 4 calls |
| References on the call at `render.js:38` | 3: the key and the 2 calls in `render.js` | 5: the key and the 4 calls |
| File references to `lib/format.js` | 1, its own `module.exports` | 5: the 3 modules, `test/format.test.js`, its own `module.exports` |

- `module.exports = { formatDate: formatDate, ... }` creates a second symbol. References on the
  function stop at the export; references on the key reach the callers.
- The repository has no `jsconfig.json`. Without it the server builds a project from the open
  file and what that file requires, so it does not see the other callers. The `jsconfig.json`
  (`module: commonjs`, all `.js` files) was added to the temporary copy only.
- The first queries were sent right after `didOpen`, before the server had loaded the project.
  It answered with partial results (0 references from the call site, 1 from the key) and no
  error. With a 1 s wait and a `definition` request before `references`, the same queries
  returned the full lists above.

## Conclusion

For this question, the search by function name and LSP "find references" give the same answer,
and it is incomplete: both miss the Oblik-Plus export, the one consumer that another system
reads. The dependency goes through a string and a config file, not through a symbol, so a tool
that understands symbols is no better here than a text search. LSP is also silently incomplete
when the project is not configured or not yet loaded.

What found the third consumer is a question about the module, not the function: which files
require `lib/format.js` (the `require` search, or LSP file references), followed by reading each
of those files in full. Both cost almost nothing once the question is asked that way.

The Explore subagent found all three consumers without hints and answered more than was asked
(readers, contracts, test gaps), at about 47k tokens and over a minute. That answer still had to
be checked against the code, and one of its claims was not in the code. In an unfamiliar codebase
it is the useful first pass; the module-level search is the cheap check that the list is
complete.
