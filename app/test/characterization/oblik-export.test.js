// BILL-482 characterization: the nightly file for Облік-Плюс.
//
// Read by ANOTHER SYSTEM, not a person. It must stay byte for byte as it is:
// Облік-Плюс expects dates as MM/DD/YYYY and silently skips rows it cannot
// parse (app/docs/integrations/oblik-plus.md). The dates reach
// format.formatDate through a name built at runtime (format['format' + col.type]
// in lib/export/accounting.js; "type": "Date" in config/export-columns.json),
// so a search for "formatDate" does not find this consumer.
// Every test here must stay green through BILL-482.
var test = require('node:test');
var assert = require('node:assert/strict');
var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');
var format = require('../../lib/format');
var accounting = require('../../lib/export/accounting');
var columns = require('../../config/export-columns.json');

var APP = path.join(__dirname, '..', '..');
var GOLDEN = path.join(__dirname, 'golden');
var DAY = '2026-04-01';

var tmpDirs = [];
var stdout;
var csv;

// Throwaway copy of the app: the cron script writes its out/ there, never into
// the real one. Keep in sync with reminder-mails.test.js (a shared helper under
// test/ would itself be run as a test file).
function appCopy() {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-bill482-'));
  tmpDirs.push(d);
  ['bin', 'lib', 'config', 'data'].forEach(function (name) {
    fs.cpSync(path.join(APP, name), path.join(d, name), { recursive: true });
  });
  return d;
}

function run(d, script, args) {
  var r = childProcess.spawnSync(process.execPath, [path.join(d, 'bin', script)].concat(args), { cwd: d, encoding: 'utf8' });
  assert.equal(r.status, 0, r.error ? String(r.error) : 'signal=' + r.signal + '\n' + r.stderr);
  return r.stdout;
}

// 2026-03-09 -> 03/09/2026, built here on purpose: not through lib/format.js
function mdy(iso) {
  return iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4);
}

test.before(function () {
  var dir = appCopy();
  stdout = run(dir, 'nightly-export.js', [DAY]);
  csv = fs.readFileSync(path.join(dir, 'out', 'export', 'oblik-' + DAY + '.csv'), 'utf8');
});

test.after(function () {
  tmpDirs.splice(0).forEach(function (d) {
    fs.rmSync(d, { recursive: true, force: true });
  });
});

test('nightly-export writes oblik-YYYY-MM-DD.csv', function () {
  assert.equal(stdout, 'export written: ' + path.join('out', 'export', 'oblik-' + DAY + '.csv') + '\n');
});

test('without a date, as cron and npm run export call it, the file is named by today in UTC', function () {
  // every other test passes the date; production does not (package.json "export")
  var dir = appCopy();
  var before = new Date().toISOString().slice(0, 10);
  var out = run(dir, 'nightly-export.js', []);
  var after = new Date().toISOString().slice(0, 10);
  var day = [before, after].filter(function (d) {
    // before !== after only across UTC midnight
    return out === 'export written: ' + path.join('out', 'export', 'oblik-' + d + '.csv') + '\n';
  })[0];
  assert.ok(day, out);
  assert.equal(fs.readFileSync(path.join(dir, 'out', 'export', 'oblik-' + day + '.csv'), 'utf8'), csv);
});

test('the Облік-Плюс file is byte for byte the pinned one', function () {
  assert.equal(csv, fs.readFileSync(path.join(GOLDEN, 'oblik-' + DAY + '.csv'), 'utf8'));
});

test('DocDate and PayUntil are the stored dates written as MM/DD/YYYY', function () {
  var invoices = JSON.parse(fs.readFileSync(path.join(APP, 'data', 'invoices.json'), 'utf8')).filter(function (inv) {
    return inv.status !== 'draft';
  });
  var lines = csv.split('\r\n').filter(Boolean);
  assert.deepEqual(lines[0].split(';').slice(0, 3), ['DocNo', 'DocDate', 'PayUntil']);
  assert.deepEqual(
    lines.slice(1).map(function (line) {
      return line.split(';').slice(0, 3).join(' ');
    }),
    invoices.map(function (inv) {
      return inv.number + ' ' + mdy(inv.issued_at) + ' ' + mdy(inv.due_at);
    }),
  );
});

test('drafts never reach the Облік-Плюс file', function () {
  // the seeded data has no drafts, so the file above does not show this
  var out = accounting.buildAccountingFile(
    [{ number: 'INV-D', status: 'draft', issued_at: '2026-03-09', due_at: '2026-03-23', customer_id: 1 }],
    { 1: { edrpou: '10000001', name: 'X' } },
  );
  assert.equal(out, 'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount\r\n');
});

test('every column type in export-columns.json names a function in lib/format.js', function () {
  // accounting.js looks the formatter up as format['format' + type]: renaming one breaks the export
  columns.forEach(function (c) {
    assert.equal(typeof format['format' + c.type], 'function', 'format' + c.type);
  });
});
