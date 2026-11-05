# AI on legacy — Task D control run

The primary run checked stale architecture, misleading date JSDoc, indirect CSV dispatch and independent report formatting before editing production code; no three actual agent mistakes were observed, so the walkthrough's control-run alternative was used.

## Setup

- Date: 2026-11-05.
- Fresh local clone from baseline `b03fb5d`, created with `git clone --no-hardlinks`; no primary-run tests or documentation copied into it.
- Clone: `C:\Users\pc\AppData\Local\Temp\bill482-control-8b1a262599884e78a64de07bc64a2e60`.
- Removed root `README.md`, `AGENTS.md`, `CLAUDE.md`, `.coderabbit.yaml`, `.github/`, `docs/` where present; retained `app/README.md` and `app/docs/`.
- Model/tool: Codex subagent using `gpt-6-luna`, low reasoning, the fast/affordable model available in this session; no inherited conversation (`fork_turns: none`).
- The only task content supplied was BILL-482; an operational wrapper restricted work to the isolated clone and prohibited committing/pushing.

## Prompt sent

```text
Work ONLY in C:\Users\pc\AppData\Local\Temp\bill482-control-8b1a262599884e78a64de07bc64a2e60 (isolated clone). Implement the ticket below; do not commit or push. Report exact changes, tests and a concise result statement. Ticket:
# BILL-482 · Дата в рахунках у неправильному форматі
**Тип:** Bug · **Пріоритет:** Medium · **Оцінка:** 0,5 год
**Автор:** Оксана, клієнтський відділ
Клієнти плутають дати в рахунках. Ми показуємо `03/09/2026`, і половина людей читає це як 3 вересня, а не 9 березня. Минулого тижня двоє клієнтів сплатили на пів року пізніше, бо вирішили, що «до 03/12» — це грудень.
**Треба:** у рахунках дата має бути в українському форматі — `09.03.2026` (дд.мм.рррр).
**Де видно:** HTML-рахунок (`/invoices/INV-2026-00007`), а також листи-нагадування про оплату, там теж «сплатити до 03/12/2026».
Здається, це одна функція форматування. Дрібна правка.
_Коментар тімліда:_ ок, беріть. Тільки обережно — це старий білінг, тестів там небагато.
```

## Observed changes and statement

The complete application diff is retained in [control-run.patch](control-run.patch); stripped course-file deletions are excluded.
`git diff --stat -- app` from the clone root:

```text
 app/lib/format.js         | 4 ++--
 app/test/invoices.test.js | 4 ++--
 app/test/reminders.test.js| 1 +
 3 files changed, 5 insertions(+), 4 deletions(-)
```

The agent changed the existing `formatDate` implementation globally, updated its JSDoc and invoice expectations, and added a reminder date assertion.
It did not protect accounting's dynamically configured date columns.

Its final statement:

> Implemented BILL-482 in the isolated clone. `app/lib/format.js` now formats dates as `DD.MM.YYYY`; invoice and reminder tests cover the new output. The full suite passes: 106/106 tests.

The agent reported seeing its newly changed date expectations fail before implementation; the primary agent independently reran the final suite: 106 passed, 0 failed.
This does not provide pre-change characterization of the machine output.

## Independently checked machine regression

Called both clones' `buildAccountingFile` with the same `app/test/fixtures/date-contract-input.json` input.
The header, amounts, text sanitizing and CRLF stayed the same, but the data row changed:

```text
Baseline: INV-2026-00007;03/09/2026;03/12/2026;10000001;ТОВ <Тест> філія 2;1000.00;200.00;1200.00
Control:  INV-2026-00007;09.03.2026;12.03.2026;10000001;ТОВ <Тест> філія 2;1000.00;200.00;1200.00
```

Reconstruct the saved application changes from the primary repo root in PowerShell; no original temporary directory or model access is needed.
This replays the patch rather than rerunning the model; course-file deletion is unnecessary for the output comparison.

```powershell
$repoRoot = (Get-Location).Path
$controlRoot = Join-Path ([IO.Path]::GetTempPath()) ('bill482-repro-' + [guid]::NewGuid().ToString('N'))
git clone --quiet --no-hardlinks --config core.autocrlf=false $repoRoot $controlRoot
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
git -C $controlRoot checkout --quiet --detach b03fb5d9b66929158c19280e4d70407f2b874ffe
if ($LASTEXITCODE -ne 0) { throw 'Baseline checkout failed' }
git -C $controlRoot apply --unidiff-zero (Join-Path $repoRoot 'docs/control-run.patch')
if ($LASTEXITCODE -ne 0) { throw 'Control patch failed' }

@'
var assert = require('node:assert/strict');
var path = require('node:path');
var f = require('./app/test/fixtures/date-contract-input.json');
var main = require('./app/lib/export/accounting');
var control = require(path.join(process.argv[2], 'app/lib/export/accounting'));
var expected = require('node:fs').readFileSync('./app/test/fixtures/accounting.csv', 'utf8');
var mainCsv = main.buildAccountingFile([f.invoice], {1: f.customer});
var controlCsv = control.buildAccountingFile([f.invoice], {1: f.customer});
assert.equal(mainCsv, expected);
assert.equal(controlCsv, expected.replace('03/09/2026;03/12/2026', '09.03.2026;12.03.2026'));
assert.notEqual(mainCsv, controlCsv);
console.log('Main CSV matches the US-date golden; control CSV changes both dates.');
console.log('Main:    ' + mainCsv.split('\r\n')[1]);
console.log('Control: ' + controlCsv.split('\r\n')[1]);
'@ | node - $controlRoot
if ($LASTEXITCODE -ne 0) { throw 'CSV comparison failed' }

Push-Location (Join-Path $controlRoot 'app')
try {
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Control tests failed' }
} finally {
  Pop-Location
}
```

Expected: the CSV comparison succeeds by demonstrating the regression, while all 106 control tests pass.
The reconstructed clone remains at `$controlRoot` for inspection.

This violates the `MM/DD/YYYY` integration contract in `app/docs/integrations/oblik-plus.md`.
The external importer itself was not executed; its documented silent rejection behavior was not independently observed.

## Difference from the primary run

The control run followed the ticket's “one function” suggestion and trusted seeded coverage; dynamic dispatch escaped those tests.
The primary run traced formatter object access into JSON configuration, committed full output characterizations before production edits (`343568a`), and added an explicit customer formatter.
The final primary suite has 115 passing tests; both CSV golden files are unchanged, and comparison against the baseline implementation on all seeded invoices/customers confirms the entire 3,753-byte accounting CSV is identical.
The durable guardrails are in `app/AGENTS.md`, linked from root instructions for tools that do not automatically load nested instructions.
