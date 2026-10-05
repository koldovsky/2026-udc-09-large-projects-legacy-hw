// BILL-482 characterization: payment reminders as bin/send-reminders.js writes
// them into the outbox for the SMTP relay.
//
// Two readers: the mail BODY is read by the customer (a person) — since BILL-482
// its due date is DD.MM.YYYY (format.formatDateUa; the golden was updated for the
// date format only). The file NAME and the To:/Subject: block are read by the
// relay (a system) and must stay as they are.
var test = require('node:test');
var assert = require('node:assert/strict');
var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var APP = path.join(__dirname, '..', '..');
var GOLDEN = path.join(__dirname, 'golden');
var DAY = '2026-03-13'; // with the seeded data: 3 "upcoming" and 4 "overdue" mails

var tmpDirs = [];
var stdout;
var files;

// Throwaway copy of the app: the cron script writes its out/ there, never into
// the real one. Keep in sync with oblik-export.test.js (a shared helper under
// test/ would itself be run as a test file).
function appCopy() {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-bill482-'));
  tmpDirs.push(d);
  ['bin', 'lib', 'config', 'data'].forEach(function (name) {
    fs.cpSync(path.join(APP, name), path.join(d, name), { recursive: true });
  });
  return d;
}

function run(d, script, args, env) {
  var r = childProcess.spawnSync(process.execPath, [path.join(d, 'bin', script)].concat(args), { cwd: d, encoding: 'utf8', env: env });
  assert.equal(r.status, 0, r.error ? String(r.error) : 'signal=' + r.signal + '\n' + r.stderr);
  return r.stdout;
}

function golden(name) {
  return fs.readFileSync(path.join(GOLDEN, name), 'utf8');
}

// MM/DD/YYYY (before BILL-482) and DD.MM.YYYY (after) both become YYYY-MM-DD,
// so whatever is left must not change with the ticket
function canonDates(s) {
  return s
    .replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, '$3-$1-$2')
    .replace(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g, '$3-$2-$1');
}

function readOutbox(d) {
  var outbox = path.join(d, 'out', 'mail');
  return fs
    .readdirSync(outbox)
    .sort()
    .map(function (name) {
      return { name: name, text: fs.readFileSync(path.join(outbox, name), 'utf8') };
    });
}

function allMail(list) {
  return list
    .map(function (f) {
      return '=== ' + f.name + '\n' + f.text;
    })
    .join('');
}

test.before(function () {
  var dir = appCopy();
  stdout = run(dir, 'send-reminders.js', [DAY]);
  files = readOutbox(dir);
});

test.after(function () {
  tmpDirs.splice(0).forEach(function (d) {
    fs.rmSync(d, { recursive: true, force: true });
  });
});

test('send-reminders queues 7 mails for ' + DAY, function () {
  assert.equal(stdout, '7 reminder(s) queued\n');
});

test('every mail file is exactly the pinned one (names, headers and bodies)', function () {
  assert.equal(allMail(files), golden('reminders-' + DAY + '.txt'));
});

test('every mail file is the same whatever the server time zone', function () {
  ['America/Los_Angeles', 'Pacific/Kiritimati'].forEach(function (tz) {
    var d = appCopy();
    var r = childProcess.spawnSync(process.execPath, [path.join(d, 'bin', 'send-reminders.js'), DAY], {
      cwd: d,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { TZ: tz }),
    });
    assert.equal(r.status, 0, tz + ' ' + r.stderr);
    assert.equal(allMail(readOutbox(d)), golden('reminders-' + DAY + '.txt'), tz);
  });
});

test('apart from the date format, every mail file is exactly the pinned one', function () {
  assert.equal(canonDates(allMail(files)), canonDates(golden('reminders-' + DAY + '.txt')));
});

test('file names and the To:/Subject: block — what the relay reads — are pinned', function () {
  var actual = files
    .map(function (f) {
      return f.name + '\n' + f.text.split('\n\n')[0] + '\n';
    })
    .join('\n');
  assert.equal(actual, golden('reminders-' + DAY + '.relay.txt'));
});

// Added after mutation testing (docs/task-e-bonus.md): every test above passes
// the date, while npm run reminders (package.json) runs the script without one.
test('without a date, as npm run reminders calls it, mail files are named by today in UTC', function () {
  var d = appCopy();
  // a zone where the local date is never the UTC date, so a script that took the
  // local date would name the files by another day
  var env = Object.assign({}, process.env, { TZ: new Date().getUTCHours() < 12 ? 'Etc/GMT+12' : 'Etc/GMT-14' });
  var before = new Date().toISOString().slice(0, 10);
  var out = run(d, 'send-reminders.js', [], env);
  var after = new Date().toISOString().slice(0, 10);
  var list = readOutbox(d);
  // the 27 seeded unpaid invoices stay overdue (nobody sets overdue_reminded)
  assert.ok(list.length > 0, 'no mail in the outbox');
  assert.equal(out, list.length + ' reminder(s) queued\n');
  list.forEach(function (f) {
    assert.match(f.name, /^\d{4}-\d{2}-\d{2}-(upcoming|overdue)-\d+\.txt$/);
    // before !== after only across UTC midnight
    assert.ok(f.name.slice(0, 10) === before || f.name.slice(0, 10) === after, f.name);
  });
});

test('no email or no customer -> no file for the relay; no contact name -> a generic greeting', function () {
  // email and contact_name are optional (lib/customers/validate.js), but every
  // seeded customer has both, so the outbox above does not show this
  var reminders = require('../../lib/notifications/reminders');
  var inv = { id: 1, number: 'INV-X', status: 'issued', due_at: '2026-03-01', total_kopecks: 100, customer_id: 1 };
  var mails = reminders.buildReminders(
    [inv, Object.assign({}, inv, { id: 2, customer_id: 2 }), Object.assign({}, inv, { id: 3, customer_id: 3 })],
    { 1: { email: '', contact_name: 'Олена' }, 2: { email: 'b@example.com' } },
    DAY,
  );
  assert.deepEqual(
    mails.map(function (m) {
      return m.invoice_id + ' ' + m.to;
    }),
    ['2 b@example.com'],
  );
  assert.equal(mails[0].text.split('\n')[0], 'Шановний клієнте,');
});
