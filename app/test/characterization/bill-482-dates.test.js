/**
 * Characterization tests for BILL-482 (MM/DD/YYYY -> DD.MM.YYYY date format change).
 *
 * These pin the CURRENT behaviour of lib/format.js formatDate and every place
 * it is consumed, so a change to the formatter shows exactly what moved.
 * Not a spec of what's "correct" — a snapshot of what's true today.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

var APP_ROOT = path.join(__dirname, '..', '..');
var DATA = path.join(APP_ROOT, 'data');
var GOLDEN_DIR = path.join(__dirname, 'golden');

var format = require('../../lib/format');
var render = require('../../lib/invoices/render');
var invoiceRoutes = require('../../lib/invoices/routes');
var reminders = require('../../lib/notifications/reminders');
var accounting = require('../../lib/export/accounting');
var store = require('../../lib/store');

// ---- golden helper -------------------------------------------------------
// Missing golden => fail loudly (never silently create one), unless
// UPDATE_GOLDEN=1 is set, in which case we (re)write it.
function golden(name, actual) {
  var file = path.join(GOLDEN_DIR, name);
  var json = JSON.stringify(actual, null, 2) + '\n';
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(file, json, 'utf8');
    return;
  }
  if (!fs.existsSync(file)) {
    throw new Error('missing golden file: ' + file + ' (run with UPDATE_GOLDEN=1 to create it)');
  }
  assert.equal(json, fs.readFileSync(file, 'utf8'));
}

function customersById() {
  var byId = {};
  require('../../data/customers.json').forEach(function (c) {
    byId[c.id] = c;
  });
  return byId;
}

// ---- T1: formatDate itself ------------------------------------------------

test('T1 formatDate: current output for plain dates, a Date object and a timestamp string', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-31'), '12/31/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9))), '03/09/2026');
  assert.equal(format.formatDate('2026-03-09T23:30:00Z'), '03/09/2026');
  // a string keeps its first 10 chars and ignores the offset (that instant is 03/10 in UTC);
  // a Date object is read in UTC
  assert.equal(format.formatDate('2026-03-09T23:30:00-05:00'), '03/09/2026');
  assert.equal(format.formatDate(new Date('2026-03-09T23:30:00-05:00')), '03/10/2026');
});

test('T1 formatDate: empty and invalid inputs', function () {
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate(undefined), '');
  assert.equal(format.formatDate('garbage'), '');
});

// ---- T2: invoice HTML for every fixture invoice ----------------------------

test('T2 renderInvoiceHtml: every invoice in data/invoices.json', function () {
  var invoices = require('../../data/invoices.json');
  var byId = customersById();
  var out = {};
  invoices.forEach(function (inv) {
    out[inv.number] = render.renderInvoiceHtml(inv, byId[inv.customer_id]);
  });
  golden('invoice-html.json', out);
});

// ---- T3: HTTP route GET /invoices/:number ---------------------------------

function tmpInvoiceStore() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-bill482-'));
  ['customers', 'invoices'].forEach(function (name) {
    fs.copyFileSync(path.join(DATA, name + '.json'), path.join(dir, name + '.json'));
  });
  store.open(dir);
  return dir;
}

function callHtmlRoute(number) {
  var r = invoiceRoutes.filter(function (x) { return x.method === 'GET' && x.path === '/invoices/:number'; })[0];
  assert.ok(r, 'route GET /invoices/:number');
  var ctx = { params: { number: number }, query: {}, body: null };
  return new Promise(function (resolve) {
    r.handler(null, null, ctx, function (err, status, payload) {
      if (err) return resolve({ status: err.status || 500, error: err.message });
      resolve({ status: status, body: payload });
    });
  });
}

test.after(function () {
  store.open();
});

test('T3 GET /invoices/:number for INV-2026-00007 matches the T2 golden', async function () {
  var dir = tmpInvoiceStore();
  var expected = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'invoice-html.json'), 'utf8'));
  try {
    var r = await callHtmlRoute('INV-2026-00007');
    assert.equal(r.status, 200);
    assert.equal(r.body, expected['INV-2026-00007']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- T4: CLI bin/render-invoice.js -----------------------------------------

test('T4 CLI render-invoice.js INV-2026-00007 stdout matches the T2 golden', function () {
  var expected = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'invoice-html.json'), 'utf8'));
  var stdout = childProcess.execFileSync(
    process.execPath,
    [path.join(APP_ROOT, 'bin', 'render-invoice.js'), 'INV-2026-00007'],
    { cwd: APP_ROOT, encoding: 'utf8' },
  );
  assert.equal(stdout, expected['INV-2026-00007']);
});

// ---- T5: reminders ----------------------------------------------------------

// Chosen by scanning data/invoices.json due dates (Feb/Mar 2026) against
// config/default.json reminders.daysBeforeDue (3): both of these "today"
// values land on a day that is 3 days before some invoice's due date
// (an 'upcoming' mail) AND after other invoices' due dates that are still
// unpaid (an 'overdue' mail), so each one alone already mixes both kinds.
var REMINDER_TODAYS = ['2026-03-13', '2026-03-20'];

test('T5 buildReminders: mixed upcoming/overdue mails for chosen "today" values', function () {
  var invoices = require('../../data/invoices.json');
  var byId = customersById();
  var out = {};
  var seenKinds = {};
  REMINDER_TODAYS.forEach(function (today) {
    var mails = reminders.buildReminders(invoices, byId, today);
    mails.forEach(function (m) { seenKinds[m.kind] = true; });
    out[today] = mails;
  });
  // guard: golden must never be vacuous
  assert.ok(seenKinds.upcoming, 'expected at least one upcoming mail across the chosen todays');
  assert.ok(seenKinds.overdue, 'expected at least one overdue mail across the chosen todays');
  golden('reminders.json', out);
});

// ---- T6: accounting export --------------------------------------------------

test('T6 buildAccountingFile: file contract (CRLF, header first)', function () {
  var invoices = require('../../data/invoices.json');
  var byId = customersById();
  var text = accounting.buildAccountingFile(invoices, byId);

  assert.equal(text.slice(-2), '\r\n', 'file must end with CRLF');
  assert.equal(/(?<!\r)\n/.test(text), false, 'every \\n must be preceded by \\r');

  var lines = text.split('\r\n');
  assert.equal(lines[0], 'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount');

  golden('oblik-export.json', lines);
});

// CONTRACT: Облік-Плюс requires MM/DD/YYYY on DocDate/PayUntil and silently
// skips a row otherwise (see docs/integrations/oblik-plus.md) — this output
// must never change even after BILL-482 lands elsewhere.
test('T6 CONTRACT: DocDate/PayUntil stay MM/DD/YYYY, matched by header name', function () {
  var invoices = require('../../data/invoices.json');
  var byId = customersById();
  var text = accounting.buildAccountingFile(invoices, byId);
  var lines = text.split('\r\n').filter(function (l) { return l.length; });

  var header = lines[0].split(';');
  var docDateCol = header.indexOf('DocDate');
  var payUntilCol = header.indexOf('PayUntil');
  var docNoCol = header.indexOf('DocNo');
  assert.notEqual(docDateCol, -1);
  assert.notEqual(payUntilCol, -1);
  assert.notEqual(docNoCol, -1);

  var byNumber = {};
  invoices.forEach(function (inv) { byNumber[inv.number] = inv; });

  // the exporter drops draft invoices; none exist in the fixture today, but
  // the row count still has to match the non-draft invoices to prove that.
  var nonDraft = invoices.filter(function (inv) { return inv.status !== 'draft'; });
  assert.equal(lines.length - 1, nonDraft.length);

  lines.slice(1).forEach(function (line) {
    var cells = line.split(';');
    var inv = byNumber[cells[docNoCol]];
    assert.ok(inv, 'row must correspond to a known invoice');
    // expected value is built from the raw ISO string, NOT via format.formatDate:
    // that function is exactly what BILL-482 will change, so asserting against
    // it here would make this contract test pass even if formatDate broke it.
    [ [docDateCol, inv.issued_at], [payUntilCol, inv.due_at] ].forEach(function (pair) {
      var cell = cells[pair[0]];
      var iso = pair[1];
      var mmddyyyy = iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4);
      assert.match(cell, /^\d{2}\/\d{2}\/\d{4}$/);
      assert.equal(cell, mmddyyyy);
    });
  });
});

// ---- T7/T8: end-to-end through the writer entry points --------------------
// These run the actual bin/ scripts against a throwaway COPY of the app so
// nothing lands in the real app/out. The copy excludes out/, .remember/,
// test/ and node_modules/ — none of it is needed to run the two scripts.

function tmpAppCopy() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-bill482-e2e-'));
  fs.cpSync(APP_ROOT, dir, {
    recursive: true,
    filter: function (src) {
      var rel = path.relative(APP_ROOT, src);
      if (rel === '') return true;
      var top = rel.split(path.sep)[0];
      return top !== 'out' && top !== '.remember' && top !== 'test' && top !== 'node_modules';
    },
  });
  return dir;
}

test('T7 e2e bin/nightly-export.js writes the exact CRLF file the T6 golden pins', function () {
  var goldenLines = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'oblik-export.json'), 'utf8'));
  var dir = tmpAppCopy();
  try {
    childProcess.execFileSync(process.execPath, [path.join(dir, 'bin', 'nightly-export.js'), '2026-03-31'], {
      cwd: dir,
      encoding: 'utf8',
    });
    var written = fs.readFileSync(path.join(dir, 'out', 'export', 'oblik-2026-03-31.csv'), 'utf8');
    assert.equal(written, goldenLines.join('\r\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('T8 e2e bin/send-reminders.js writes exactly the mails the T5 golden implies', function () {
  var goldenReminders = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'reminders.json'), 'utf8'));
  var today = '2026-03-13';
  var mails = goldenReminders[today];
  assert.ok(mails && mails.length, 'golden must have mails for ' + today);

  var expectedFiles = {};
  mails.forEach(function (m) {
    var name = today + '-' + m.kind + '-' + m.invoice_id + '.txt';
    expectedFiles[name] = 'To: ' + m.to + '\nSubject: ' + m.subject + '\n\n' + m.text + '\n';
  });

  var dir = tmpAppCopy();
  try {
    childProcess.execFileSync(process.execPath, [path.join(dir, 'bin', 'send-reminders.js'), today], {
      cwd: dir,
      encoding: 'utf8',
    });
    var mailDir = path.join(dir, 'out', 'mail');
    var actualNames = fs.readdirSync(mailDir).sort();
    assert.deepEqual(actualNames, Object.keys(expectedFiles).sort());
    actualNames.forEach(function (name) {
      assert.equal(fs.readFileSync(path.join(mailDir, name), 'utf8'), expectedFiles[name]);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
