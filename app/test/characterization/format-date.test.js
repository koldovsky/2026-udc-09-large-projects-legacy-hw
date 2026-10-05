// BILL-482 characterization: lib/format.js formatDate exactly as it behaves today.
//
// Shared by the invoice HTML, the reminder mails AND (through
// config/export-columns.json) the Облік-Плюс export. Changing this output
// changes all three. Current behaviour is pinned, oddities included.
// Stays green only if formatDate is not changed in place.
var test = require('node:test');
var assert = require('node:assert/strict');
var childProcess = require('child_process');
var path = require('path');
var format = require('../../lib/format');

var APP = path.join(__dirname, '..', '..');

test('formatDate: YYYY-MM-DD -> MM/DD/YYYY', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-31'), '12/31/2026');
  assert.equal(format.formatDate('2027-01-01'), '01/01/2027');
});

test('formatDate: only the first 10 characters of a string count', function () {
  assert.equal(format.formatDate('2026-03-09T23:59:59Z'), '03/09/2026');
  assert.equal(format.formatDate('2026-03-09T23:30:00-05:00'), '03/09/2026'); // parsed whole: 03/10
  assert.equal(format.formatDate('2026-03-09xyz'), '03/09/2026'); // parsed whole: ''
});

test('formatDate: a Date is read in UTC', function () {
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9))), '03/09/2026');
  // local getters would give 03/08 west of UTC or 03/10 east of it
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9, 0, 30))), '03/09/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9, 23, 30))), '03/09/2026');
});

test('formatDate: the same result whatever the server time zone', function () {
  ['America/Los_Angeles', 'Pacific/Kiritimati'].forEach(function (tz) {
    var r = childProcess.spawnSync(
      process.execPath,
      ['-e', "var f = require('./lib/format'); process.stdout.write(f.formatDate('2026-03-09') + ' ' + f.formatDate(new Date(Date.UTC(2026, 2, 9))))"],
      { cwd: APP, encoding: 'utf8', env: Object.assign({}, process.env, { TZ: tz }) },
    );
    assert.equal(r.stdout, '03/09/2026 03/09/2026', tz + ' ' + r.stderr);
  });
});

test('formatDate: empty or unparsable input -> empty string', function () {
  ['', null, undefined, 'not a date'].forEach(function (v) {
    assert.equal(format.formatDate(v), '', String(v));
  });
});

test('formatDate: an impossible date rolls over (looks like a bug — pinned, not fixed)', function () {
  assert.equal(format.formatDate('2026-02-30'), '03/02/2026');
});

// Added after mutation testing (docs/task-e-bonus.md). formatDateUa (BILL-482) is
// otherwise reached only through the goldens, and every seeded invoice has both
// dates, so its guards never ran.
test('formatDateUa: empty or unparsable input -> empty string', function () {
  ['', null, undefined, 'not a date'].forEach(function (v) {
    assert.equal(format.formatDateUa(v), '', String(v));
  });
});

test('a date that is not zero-padded is unparsable, in both formatters', function () {
  // toDate parses '2026-3-9T00:00:00Z', which is invalid. Without the 'T00:00:00Z'
  // V8 would take '2026-3-9' as LOCAL midnight: a date, and a day early east of UTC
  assert.equal(format.formatDate('2026-3-9'), '');
  assert.equal(format.formatDateUa('2026-3-9'), '');
});
