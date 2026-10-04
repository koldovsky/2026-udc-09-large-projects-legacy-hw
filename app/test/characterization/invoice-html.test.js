// BILL-482 characterization: the invoice a customer reads.
//
// Read by a PERSON: GET /invoices/:number and bin/render-invoice.js both go
// through lib/invoices/render.js. Pinned before the change; with BILL-482 the
// dates became DD.MM.YYYY (format.formatDateUa) and the goldens were updated
// for the date format only. The "apart from the date format" test proves that
// nothing else changed.
var test = require('node:test');
var assert = require('node:assert/strict');
var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var path = require('path');
var render = require('../../lib/invoices/render');
var createServer = require('../../server').createServer;

var APP = path.join(__dirname, '..', '..');
var GOLDEN = path.join(__dirname, 'golden');
var NUMBER = 'INV-2026-00007';

var cliHtml;

function golden(name) {
  return fs.readFileSync(path.join(GOLDEN, name), 'utf8');
}

// one tag per line: the golden HTML is a single long line
function tags(html) {
  return html.replace(/></g, '>\n<');
}

// exact comparison, with a readable diff when it fails
function assertSameHtml(actual, expected) {
  if (actual !== expected) assert.equal(tags(actual), tags(expected));
  assert.equal(actual, expected);
}

// MM/DD/YYYY (before BILL-482) and DD.MM.YYYY (after) both become YYYY-MM-DD,
// so whatever is left must not change with the ticket
function canonDates(s) {
  return s
    .replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, '$3-$1-$2')
    .replace(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g, '$3-$2-$1');
}

test.before(function () {
  var r = childProcess.spawnSync(process.execPath, [path.join(APP, 'bin', 'render-invoice.js'), NUMBER], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.error ? String(r.error) : 'signal=' + r.signal + '\n' + r.stderr);
  cliHtml = r.stdout;
});

test('GET /invoices/:number serves the pinned HTML', { timeout: 10000 }, function (t, done) {
  var server = createServer();
  t.after(function () {
    server.close();
  });
  server.listen(0, function () {
    http
      .get({ port: server.address().port, path: '/invoices/' + NUMBER }, function (res) {
        var chunks = [];
        res.on('data', function (c) {
          chunks.push(c);
        });
        res.on('end', function () {
          try {
            assert.equal(res.statusCode, 200);
            assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
            assertSameHtml(Buffer.concat(chunks).toString('utf8'), golden('invoice-' + NUMBER + '.html'));
            done();
          } catch (e) {
            done(e);
          }
        });
      })
      .on('error', done);
  });
});

test('bin/render-invoice.js prints the same pinned HTML', function () {
  assertSameHtml(cliHtml, golden('invoice-' + NUMBER + '.html'));
});

test('apart from the date format, the HTML is exactly the pinned one', function () {
  assert.equal(tags(canonDates(cliHtml)), tags(canonDates(golden('invoice-' + NUMBER + '.html'))));
});

test('the dates line of every seeded invoice is pinned', function () {
  var customers = {};
  JSON.parse(fs.readFileSync(path.join(APP, 'data', 'customers.json'), 'utf8')).forEach(function (c) {
    customers[c.id] = c;
  });
  var lines = JSON.parse(fs.readFileSync(path.join(APP, 'data', 'invoices.json'), 'utf8')).map(function (inv) {
    var html = render.renderInvoiceHtml(inv, customers[inv.customer_id]);
    return inv.number + ' ' + (/<p class="dates">.*?<\/p>/.exec(html) || ['NO DATES LINE'])[0];
  });
  assert.equal(lines.join('\n') + '\n', golden('invoice-dates.txt'));
});

// the same dates lines, rendered in a separate process with another server time zone
var DATES_SCRIPT = [
  "var render = require('./lib/invoices/render');",
  'var customers = {};',
  "require('./data/customers.json').forEach(function (c) { customers[c.id] = c; });",
  "process.stdout.write(require('./data/invoices.json').map(function (inv) {",
  '  var html = render.renderInvoiceHtml(inv, customers[inv.customer_id]);',
  "  return inv.number + ' ' + (/<p class=\"dates\">.*?<\\/p>/.exec(html) || ['NO DATES LINE'])[0];",
  "}).join('\\n') + '\\n');",
].join('\n');

test('the dates lines are the same whatever the server time zone', function () {
  ['America/Los_Angeles', 'Pacific/Kiritimati'].forEach(function (tz) {
    var r = childProcess.spawnSync(process.execPath, ['-e', DATES_SCRIPT], {
      cwd: APP,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { TZ: tz }),
    });
    assert.equal(r.status, 0, tz + ' ' + r.stderr);
    assert.equal(r.stdout, golden('invoice-dates.txt'), tz);
  });
});
