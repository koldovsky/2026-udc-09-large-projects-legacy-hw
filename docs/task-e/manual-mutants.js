// Task E (bonus), path 2 — hand-written mutants for docs/task-e-bonus.md.
//
// Usage (from the repo root):   node docs/task-e/manual-mutants.js app
//
// For each mutant: patch one file in app/, run `node --test`, record whether
// the suite went red (KILLED) or stayed green (SURVIVED), then restore the
// file — always, even if something throws. Finishes by re-running the suite
// to prove the tree is back to green. Nothing is written inside app/ except
// the temporary patch; no npm dependencies.
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var APP = process.argv[2];
if (!APP) { console.error('usage: node docs/task-e/manual-mutants.js <path-to-app>'); process.exit(2); }

var M = [
  // --- lib/format.js: the shared formatter ---
  { id: 'F1', file: 'lib/format.js', why: 'formatDate: день і місяць місцями (DD/MM/YYYY)',
    from: "return pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + '/' + d.getUTCFullYear();",
    to:   "return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();" },
  { id: 'F2', file: 'lib/format.js', why: 'formatDate: роздільник "/" -> "." (інцидент лютого 2021 — укр. формат потрапляє в експорт)',
    from: "return pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + '/' + d.getUTCFullYear();",
    to:   "return pad(d.getUTCMonth() + 1) + '.' + pad(d.getUTCDate()) + '.' + d.getUTCFullYear();" },
  { id: 'F3', file: 'lib/format.js', why: 'formatDate: без нуля попереду (3/9/2026)',
    from: "return pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + '/' + d.getUTCFullYear();",
    to:   "return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + d.getUTCFullYear();" },
  { id: 'F4', file: 'lib/format.js', why: 'formatDate: прибрано guard `if (!value) return \'\'` (еквівалентний мутант?)',
    from: "function formatDate(value) {\n  if (!value) return '';",
    to:   "function formatDate(value) {" },
  { id: 'F5', file: 'lib/format.js', why: 'formatDateUa: день і місяць місцями (MM.DD.YYYY)',
    from: "return pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();",
    to:   "return pad(d.getUTCMonth() + 1) + '.' + pad(d.getUTCDate()) + '.' + d.getUTCFullYear();" },
  { id: 'F6', file: 'lib/format.js', why: 'formatDateUa: прибрано перевірку isNaN (NaN.NaN.NaN для сміття)',
    from: "function formatDateUa(value) {\n  if (!value) return '';\n  var d = toDate(value);\n  if (isNaN(d.getTime())) return '';",
    to:   "function formatDateUa(value) {\n  if (!value) return '';\n  var d = toDate(value);" },
  { id: 'F7', file: 'lib/format.js', why: 'toDate: локальний час замість UTC (T00:00:00 без Z)',
    from: "return new Date(String(value).slice(0, 10) + 'T00:00:00Z');",
    to:   "return new Date(String(value).slice(0, 10) + 'T00:00:00');" },

  // --- lib/invoices/render.js: consumer 1 (people) ---
  { id: 'R1', file: 'lib/invoices/render.js', why: 'render: дату рахунку «відкотили» назад на formatDate',
    from: "esc(format.formatDateUa(invoice.issued_at))", to: "esc(format.formatDate(invoice.issued_at))" },
  { id: 'R2', file: 'lib/invoices/render.js', why: 'render: дату оплати «відкотили» назад на formatDate',
    from: "esc(format.formatDateUa(invoice.due_at))", to: "esc(format.formatDate(invoice.due_at))" },
  { id: 'R3', file: 'lib/invoices/render.js', why: 'render: issued_at і due_at переплутано',
    from: "esc(format.formatDateUa(invoice.issued_at)) + '</b>';\n  html += ' · Сплатити до: <b>' + esc(format.formatDateUa(invoice.due_at))",
    to:   "esc(format.formatDateUa(invoice.due_at)) + '</b>';\n  html += ' · Сплатити до: <b>' + esc(format.formatDateUa(invoice.issued_at))" },

  // --- lib/notifications/reminders.js: consumer 2 (people) ---
  { id: 'N1', file: 'lib/notifications/reminders.js', why: 'reminders: overdue-гілку «відкотили» на formatDate',
    from: "' мав бути сплачений до ' + format.formatDateUa(invoice.due_at)", to: "' мав бути сплачений до ' + format.formatDate(invoice.due_at)" },
  { id: 'N2', file: 'lib/notifications/reminders.js', why: 'reminders: upcoming-гілку «відкотили» на formatDate',
    from: "' слід сплатити до ' + format.formatDateUa(invoice.due_at)", to: "' слід сплатити до ' + format.formatDate(invoice.due_at)" },

  // --- lib/export/accounting.js + config: consumer 3 (Облік-Плюс) ---
  { id: 'A1', file: 'config/export-columns.json', why: 'КОНФІГ: DocDate отримав тип DateUa (Stryker JSON не мутує; так виглядав би «тихий» інцидент)',
    from: '{ "field": "issued_at", "header": "DocDate", "type": "Date" }', to: '{ "field": "issued_at", "header": "DocDate", "type": "DateUa" }' },
  { id: 'A2', file: 'config/export-columns.json', why: 'КОНФІГ: PayUntil отримав тип DateUa',
    from: '{ "field": "due_at", "header": "PayUntil", "type": "Date" }', to: '{ "field": "due_at", "header": "PayUntil", "type": "DateUa" }' },
  { id: 'A3', file: 'lib/export/accounting.js', why: 'accounting: роздільник ";" -> ","',
    from: "var SEP = ';';", to: "var SEP = ',';" },
  { id: 'A4', file: 'lib/export/accounting.js', why: 'accounting: CRLF -> LF',
    from: "var EOL = '\\r\\n';", to: "var EOL = '\\n';" },
  { id: 'A5', file: 'lib/export/accounting.js', why: 'accounting: flatten переплутав issued_at і due_at',
    from: "issued_at: invoice.issued_at,\n    due_at: invoice.due_at,", to: "issued_at: invoice.due_at,\n    due_at: invoice.issued_at," },
  { id: 'A6', file: 'lib/export/accounting.js', why: 'accounting: чернетки більше не фільтруються',
    from: "return inv.status !== 'draft';", to: "return true;" },
  { id: 'A7', file: 'lib/export/accounting.js', why: 'accounting: cell() завжди кличе formatDateUa для будь-якого типу Date*',
    from: "var render = format['format' + col.type];", to: "var render = /^Date/.test(col.type) ? format.formatDateUa : format['format' + col.type];" },
];

function runTests() {
  var r = cp.spawnSync(process.execPath, ['--test'], { cwd: APP, encoding: 'utf8', timeout: 60000 });
  var out = (r.stdout || '') + (r.stderr || '');
  var fail = /^ℹ fail (\d+)/m.exec(out);
  var failing = [];
  out.split('\n').forEach(function (l) { var m = /^✖ (.+?) \(/.exec(l); if (m) failing.push(m[1]); });
  // node prints each failing test twice (inline and in the summary) — dedupe
  failing = failing.filter(function (x, i, a) { return a.indexOf(x) === i; });
  return { status: r.status, fail: fail ? Number(fail[1]) : null, failing: failing };
}

var results = [];
M.forEach(function (m) {
  var p = path.join(APP, m.file);
  var original = fs.readFileSync(p, 'utf8');
  // the working copy is checked out with CRLF on Windows; patterns above use \n
  var eol = original.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  var from = m.from.split('\n').join(eol);
  var to = m.to.split('\n').join(eol);
  if (original.indexOf(from) === -1) {
    results.push({ id: m.id, file: m.file, why: m.why, verdict: 'NOT APPLIED (pattern not found)', failing: [] });
    return;
  }
  try {
    fs.writeFileSync(p, original.replace(from, to), 'utf8');
    var r = runTests();
    var killed = r.status !== 0 && r.fail > 0;
    results.push({ id: m.id, file: m.file, why: m.why, verdict: killed ? 'KILLED' : 'SURVIVED', failing: r.failing });
  } finally {
    fs.writeFileSync(p, original, 'utf8');
  }
});

// sanity: the suite must be green again on the restored files
var after = runTests();
console.log('restored, suite status:', after.status === 0 ? 'green' : 'RED!', 'fail=' + after.fail);
console.log('');
results.forEach(function (r) {
  console.log('[' + r.verdict + '] ' + r.id + ' ' + r.file + ' — ' + r.why);
  if (r.failing.length) console.log('    killed by: ' + r.failing.join(' | '));
});
var killed = results.filter(function (r) { return r.verdict === 'KILLED'; }).length;
var survived = results.filter(function (r) { return r.verdict === 'SURVIVED'; }).length;
console.log('');
console.log('total ' + results.length + ', killed ' + killed + ', survived ' + survived);
