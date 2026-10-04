# Where the agent got it wrong on legacy code

> Task D, part 1. Four cases from this homework, each with its evidence, and a control run of
> the bare ticket on the fastest model the tool offers.

The agent is Claude Code (VS Code extension) on `claude-opus-5-5`, in the main session and in
one `Explore` subagent that built the Task A map. Each case ends with the evidence a reader can
check from the repository: a file, a commit or a command run from the repository root. Chat
messages and tool calls are only in the session transcripts under `~/.claude/projects/` (local
files, not in the repository); each case names its sessions by the first eight characters of
the transcript file name. Quotes in English are verbatim; quotes from chats in Ukrainian are
translated and marked so. All times are UTC on 2026-10-01; for a review session the time is
when the session started.

| Session | Started | What it was |
|---|---|---|
| `e3938df1` | 11:47 | Task A: the map, the summary to the user (11:56), the user's question (11:59) |
| `e3938df1/subagents/agent-a2be3324ef771d933` | 11:50 | The `Explore` subagent that built the map; final message at 11:52 |
| `9220eb51` | 12:04 | First review of Task A |
| `fb5813ca` | 12:11 | Second review of Task A |
| `e6e05113` | 12:20 | Third review of Task A |
| `4d03accd` | 13:02 | Task C: the change |
| `10b72bbe` | 13:24 | Review of Task C |
| `7ba0011d` | 14:30 | Control run: Haiku, the bare ticket, a clean clone outside this repository |

Cases 1, 2 and 4 are about what the code and its documents say: a story from the old
documentation repeated as fact, a missed consumer, and a misleading comment fixed only in part.
Case 3 is about the agent's report on its own work. The control run at the end gives the same
ticket to the fastest model without the course files; its diff and final message are quoted in
full.

The repository shows the error itself in cases 2, 3 and 4: the subagent's answer and its tool
calls are in appendices A and B of `docs/codebase-map.md`, and the comment is in commit
`8817d04`. Case 1 was an error in chat, so the repository shows only the document the story came
from. The control run was made outside the repository; its effect on the Oblik-Plus export can
be repeated from `main` with the commands at the end of that section.

## Case 1 — A story from the old documentation repeated as a fact

- **What was asked:** Task A, build the codebase map and verify it.
- **What the agent said or did:** In its Task A summary to the user (`e3938df1`, 11:56) it
  wrote that Oblik-Plus silently skips a row with any other date format, and that "this already
  happened in 2021, when 40 invoices disappeared" (translated). It gave this as a fact, with no
  source.
- **How it was noticed:** The user quoted that sentence and asked "how do you know that?"
  (`e3938df1`, 11:59). The agent's answer began: "I do not know this, I only read about it in
  the document" (translated). The only source is `app/docs/integrations/oblik-plus.md:33-35`,
  a document from March 2021. The git history starts with the course commits, the data in
  `app/data/` is synthetic, and Oblik-Plus is outside the repository, so neither the incident
  nor the silent skip can be checked from here.
- **Why it decided so:** The document reads as a first-hand account ("we lost 40 invoices"),
  and the code confirms the part it can: the export does write `MM/DD/YYYY` through
  `formatDate` (`docs/codebase-map.md`, claim 2). The agreement on the mechanism was carried
  over to the story, which the code cannot confirm.
- **How it was fixed:** The answer in chat was corrected. The documents keep the line between
  checked and documented: `docs/codebase-map.md` claim 4 is marked "✅ (as documented)" and is
  named as the one claim whose only source is documentation, and `docs/impact.md` cites
  `oblik-plus.md:29-35` for the silent skip and the 2021 loss. The Task C decision does not rest
  on the story: the CSV is kept byte for byte because that is what it is today
  (`docs/impact.md`, section 3, step 6).
- **Check from the repository:** the chat message is in the transcript only. The story's only
  source is `app/docs/integrations/oblik-plus.md:33-35`, and
  `git log --format='%h %ad' --date=short -- app/docs/integrations/oblik-plus.md` prints one
  commit, `3f73bd8 2026-09-23`: the repository has no history from 2021 to confirm it.

## Case 2 — A consumer missed although the agent had read about it

- **What was asked:** The subagent prompt for the map (`docs/codebase-map.md`, section 1),
  item 4: "External integrations: which other systems consume the system's output, and in what
  format."
- **What the agent said or did:** The subagent listed six consumers under "## 4. External
  integrations (who consumes the output)" in its final message (`agent-a2be3324ef771d933`,
  11:52; appendix A of `docs/codebase-map.md`). The old admin UI, which reads the `/api/*` JSON,
  is not among them. The main agent verified 14 claims and told the user: "14 claims checked,
  and all of them turned out to be true" (`e3938df1`, 11:56, translated). The completeness of
  the consumer list was not one of the 14 claims. Two later review sessions (`9220eb51` at
  12:04 and `fb5813ca` at 12:11) did not flag it either: neither mentions the admin UI.
- **How it was noticed:** A third review session (`e6e05113`, 12:20) reported: "The
  integrations table has no old admin UI. And the code names it directly as an API consumer"
  (translated). It cited the code comments that name the UI: `app/lib/customers/index.js:31`
  (the old admin UI wants a plain amount string, used for `totals.outstanding` at `:221`),
  `app/lib/customers/validate.js:4-5` (the admin UI shows validation messages as-is) and
  `app/lib/audit/routes.js:11` (the admin page renders the audit rows in one table). The
  subagent's tool calls (appendix B of `docs/codebase-map.md`) show that it printed all three
  files (calls 3, 7 and 9).
- **Why it decided so:** The transcript does not show a reason. In each of the three places the
  UI is mentioned in passing, to explain a detail (a string format, the language of the
  messages, a row limit), and not described as an integration. Each of the six consumers it
  did list is described somewhere as the reader of an output; the admin UI is named only as
  the reason for a detail.
- **How it was fixed:** Claim 17 (❌) was added to `docs/codebase-map.md`, and an "Old admin
  UI (staff)" row to its integrations table. The omission does not change the scope of
  BILL-482, because no `/api/*` response passes through `lib/format.js`. It would matter for a
  change to the customer totals, so the contract is now in `app/AGENTS.md`.
- **Check from the repository:** the subagent's answer is verbatim in appendix A of
  `docs/codebase-map.md`; its section "4. External integrations" lists six consumers.
  `sed -n '/^## Appendix/,$p' docs/codebase-map.md | grep -ci admin` prints `0`. The three
  comments that name the UI are at the lines cited above.

## Case 3 — The agent's report about itself taken on faith

- **What was asked:** The same subagent prompt asked it to report the files it read, its tool
  calls, and whether it mostly searched or read files sequentially. The walkthrough asks for
  this as the navigation cost.
- **What the agent said or did:** The subagent's final message (`agent-a2be3324ef771d933`,
  11:52) said "I mapped all 41 non-test source, config and doc files under `app/`" and
  "**Approach:** mostly searching". The main agent copied both into `docs/codebase-map.md`
  section 1 ("It searched first") and told the user (`e3938df1`, 11:56) that the subagent
  "opened 41 files" (translated) and searched with `grep` before reading.
- **How it was noticed:** A review session (`9220eb51`, 12:04) went through the subagent
  transcript: call 1 lists the files, calls 2 and 3 print the core files with `cat -n`, and
  "the first `grep` appears only in call 5" (translated). Its own fix still repeated "41
  files". The next review session (`fb5813ca`, 12:11) found 52 non-test, non-data files under
  `app/`: `find . -type f -not -path './test/*' -not -path './data/*' | wc -l`, run in `app/`
  at commit `c487ec9`, prints `52`, and the subagent's own list of opened files names 52: 51 of
  them plus `test/format.test.js`. "All" was not true either. The one file missing from the
  list, `lib/catalog/index.js`, appears in no command, only in the output of the file listing
  (call 1) and of two greps (calls 5 and 7).
- **Why it decided so:** The subagent's final message was treated as data about the run, not as
  a set of claims. The verification table covered claims about the code only. On legacy code
  this matters beyond the count: "all files" is the claim that makes a map look complete, and a
  reader who trusts it stops looking for what the map left out (case 2).
- **How it was fixed:** Claims 15 and 16 (❌) were added. Section 1 now takes the navigation
  cost and the answer to "read or searched?" from the transcript only.
- **Check from the repository:** appendix A of `docs/codebase-map.md` keeps the subagent's
  "all 41 non-test source, config and doc files" (its first line), "Files opened or read (41)"
  followed by a list of 52 files, and "**Approach:** mostly searching". Appendix B lists its 11
  tool calls: calls 1–3 are a file listing and bulk `cat -n`, and the first `grep` is in
  call 5.
  `git ls-tree -r --name-only c487ec9 -- app | grep -vE '^app/(test|data)/' | wc -l` prints
  `52`, and
  `sed -n '/^\*\*Files opened or read/,/^\*\*Tool calls/p' docs/codebase-map.md | grep -c 'catalog/index'`
  prints `0`. The first version of section 1, which repeated "41" and "searched first", was
  corrected before the Task A commit; it is in the transcripts only.

## Case 4 — A misleading comment fixed only in part

- **What was asked:** Task C, implement BILL-482 (`4d03accd`). The user chose to keep
  `formatDate` for the export and add a separate function for customer dates.
- **What the agent said or did:** Commit `8817d04` corrected the `@returns` line of the
  `formatDate` doc comment ("the date in ISO format") to `MM/DD/YYYY` and the Oblik-Plus
  contract, but left the first line of the same comment, "Format a date for display."
  (`app/lib/format.js:24` at `8817d04`). Section 5 of `docs/impact.md` in the same commit said
  the comment "said ISO; it now says `MM/DD/YYYY`" and did not mention the first line. The
  function that writes the machine-read export date was still described as a display helper.
- **How it was noticed:** A review session of Task C (`10b72bbe`, 13:24) flagged the first
  line: "The first line of the comment still says `Format a date for display.`, although this
  is a format for a machine" (translated). It is the same kind of misleading comment the change
  had set out to correct.
- **Why it decided so:** In the transcript (`4d03accd`, the `Edit` call at 13:06), the edited
  text starts at the `@param` line, two lines below "Format a date for display.". The agent
  edited the line that Task A had flagged (`format.js:27`, "ISO") and did not re-read the rest
  of the comment as a claim. "For display" is the reading behind the "one function" fix that
  the ticket suggests: a reader who trusts it sees a display helper with no machine consumer.
- **How it was fixed:** Line 24 now reads "Date for the Oblik-Plus accounting export:
  MM/DD/YYYY." Section 5 of `docs/impact.md` names both changed parts of the comment. No code or
  test changed; `cd app && npm test` gives 115 tests, 115 pass.
- **Check from the repository:** `git show 8817d04:app/lib/format.js | sed -n 24p` prints
  ` * Format a date for display.`; `sed -n 24p app/lib/format.js` prints the corrected line.
  `git show 8817d04:docs/impact.md | grep -n "said ISO"` shows the section 5 sentence that
  left the first line out.

---

## What the cases have in common

In each case the agent trusted a text about something instead of the thing itself: an old
document instead of what the repository can show (case 1), its own reading of the files instead
of a search for every reader (case 2), a self-report instead of the transcript (case 3), and one
flagged line instead of the whole comment (case 4).

No test caught any of them. They are errors in claims and documentation, not in program output.
One was caught by the user's question, the other three by separate review sessions that
re-checked the work against the code and the transcripts.

On the traps the homework sets, the agent was right: it did not adopt the out-of-date
`app/docs/ARCHITECTURE.md` (codebase-map claims 5–7), it saw that the `formatDate` comment and
the code disagree (claim 1), and it found the Oblik-Plus caller that a search for the function
name misses (claim 2). The errors were in what surrounds those traps.

## Control run

The four cases are real but small: none of them is a mistake on the trap the ticket sets. The
control run tests that trap directly, with the ticket alone and without the course files.

- **Clean clone:** yes. `git clone --branch main` of this repository (starter commit `7ada5a0`)
  into a folder outside it. Removed: the root `README.md`, `AGENTS.md`, `CLAUDE.md`,
  `.coderabbit.yaml`, `.github/` and `docs/`. Kept: `app/` (with `app/README.md` and
  `app/docs/`), `.gitignore` and `materials/`, which holds only the ticket. The git history was
  removed as well (`rm -rf .git && git init && git add -A`, no commit), because the course commit
  messages describe the expected outcome of this run. The remote was removed. Before the run:
  `cd app && npm test` gave 106 tests, 106 pass, and there was no `app/out/`.
- **Tool and model:** Claude Code (VS Code extension), a new session in a new window on
  `claude-haiku-4-5-20251001`, the fastest and cheapest model the tool offers. The folder had no
  `CLAUDE.md`, `AGENTS.md` or agent memory. User-level plugins stayed on; one of them only
  shortens replies (the model's first line was "Caveman mode: full.").
- **Prompt:** the ticket only: `materials/ticket-BILL-482.md` pasted verbatim, nothing added.
  The model asked no questions.
- **Cost:** 18 tool calls, 16 model turns, about 2 min 15 s (14:30:25 to 14:32:41 UTC). About 661k
  tokens processed, 630k of them cache reads; 4,589 output tokens.
- **What it changed:** `app/lib/format.js` (+3 −3), `app/test/format.test.js` (+17, three new
  `formatDate` tests), `app/test/invoices.test.js` (+2 −2, the seeded date assertions). It
  changed the shared function in place:

  ```diff
  - * Format a date for display.
  + * Format a date for display in Ukrainian format (DD.MM.YYYY).
  ...
  - * @returns {string} the date in ISO format
  + * @returns {string} the date formatted as DD.MM.YYYY
  ...
  -  return pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + '/' + d.getUTCFullYear();
  +  return pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
  ```

  Without being asked, it then ran `git add -A && git commit`, which in the history-free clone
  became a root commit of all 88 files.
- **What it said about the result** (final message, verbatim):

  > Fixed. Changed date format in invoices from MM/DD/YYYY to DD.MM.YYYY (Ukrainian):
  >
  > **Changes:**
  > - app/lib/format.js:29-34: formatDate() now outputs DD.MM.YYYY
  > - app/test/format.test.js: Added formatDate() tests (3 test cases)
  > - app/test/invoices.test.js:37-44: Updated invoice test to expect new format
  >
  > Affects invoices and payment reminder emails. All 109 tests pass.

  The links in the original are shown here as plain paths. The Oblik-Plus export is not
  mentioned.
- **Did the output another system reads change?** Yes. `node bin/nightly-export.js 2026-03-16`
  was run in a copy of the control run's `app/`, and the file was compared with
  `app/test/golden/oblik-export.csv` (captured from the unchanged code in Task B, unchanged
  since `9435413`). `cmp` reports a difference. All 36 data rows now carry `DD.MM.YYYY` in
  `DocDate` and `PayUntil`: `INV-2026-00001;01.03.2026;15.03.2026;...` instead of
  `INV-2026-00001;03/01/2026;03/15/2026;...`. The header, the other six columns, `;` and CRLF
  are identical. According to `app/docs/integrations/oblik-plus.md:29-31`, Oblik-Plus skips a
  row with any other date format without an error. The importer itself cannot be checked from
  this repository; if it behaves as documented, the next nightly import loads none of the 36
  invoices.
- **Tests:** 109 tests, 109 pass (106 seeded and its 3 new ones). No test in the clone covers the
  CSV, so nothing turned red. The Task B characterization tests (the test file and the three
  golden files from `9435413`), copied into a copy of the control run, give 8 of 8 failing. Five
  of them are the change the ticket wants (the invoice page directly, over HTTP and from the CLI;
  the reminder mails directly and as outbox files). The other three are the regression: the
  `formatDate` test and both Oblik-Plus CSV tests.
- **Check from the repository:** the clean clone and its transcript are outside this
  repository, but the change that matters is the one line quoted above, so the result can be
  repeated from `main`. Run from the repository root:

  ```sh
  repo=$(pwd)
  tmp=$(mktemp -d)
  git archive main app | tar -x -C "$tmp"
  cd "$tmp/app"
  # the control run's change to lib/format.js:33
  node -e '
  var fs = require("fs");
  var src = fs.readFileSync("lib/format.js", "utf8");
  var out = src.replace(
    "pad(d.getUTCMonth() + 1) + \x27/\x27 + pad(d.getUTCDate()) + \x27/\x27",
    "pad(d.getUTCDate()) + \x27.\x27 + pad(d.getUTCMonth() + 1) + \x27.\x27");
  if (out === src) throw new Error("line not found");
  fs.writeFileSync("lib/format.js", out);
  '
  node --test                            # 106 tests, 105 pass, 1 fail
  node bin/nightly-export.js 2026-03-16
  cmp out/export/oblik-2026-03-16.csv "$repo/app/test/golden/oblik-export.csv"   # differ: line 2
  cd "$repo"
  git archive 9435413 app/test/bill-482-characterization.test.js app/test/golden | tar -x -C "$tmp"
  cd "$tmp/app" && node --test test/bill-482-characterization.test.js            # 8 tests, 0 pass
  ```

  The one seeded failure is the invoice date assertion (`app/test/invoices.test.js:41-42`), which
  the control run updated in its own diff; no seeded test fails on the CSV. Run on 2026-10-04 with
  Node 24.21, in bash and in zsh, with the results shown in the comments.
- **What it saw and passed over:** It read `app/lib/format.js` in full, and the file header
  says "Shared by the invoice renderer, the reminder mails and the exports, so keep the
  signatures stable" (`app/lib/format.js:4-5`). It never opened `lib/export/`,
  `config/export-columns.json` or `app/docs/`. Its first `grep` covered only
  `app/lib/invoices` and `app/lib/notifications`; its second listed files under `app/lib` and
  kept only names matching `format|invoice|render|reminders`, which drops
  `export/accounting.js`. It found the two callers by name, which the ticket also names, and
  stopped there.
- **Conclusion:** On the bare ticket the fast model made the "one function" fix the ticket
  suggests. It changed the customer dates as asked and the Oblik-Plus dates with them, and the
  green suite reported success. The main run kept `formatDate` and moved only the customer
  outputs to `formatDateUa` (`docs/impact.md`, section 5). The difference is not only the
  model: the main run had the course files, including the walkthrough's note that a search by
  function name misses a consumer, and it built and verified a map before touching the code. The
  run shows what the Task B characterization tests are for: with them in place, the same
  change turns 8 tests red instead of none.
