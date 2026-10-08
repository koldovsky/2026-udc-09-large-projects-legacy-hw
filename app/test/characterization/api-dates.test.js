// BILL-482 characterization: dates in the JSON API.
//
// Read by MACHINES (the BI sheet and the old admin UI, see app/AGENTS.md): /api/*
// returns the stored YYYY-MM-DD strings. BILL-482 changes dates for people only,
// so nothing here may become DD.MM.YYYY. Added after mutation testing
// (docs/task-e-bonus.md): formatDateUa put into lib/invoices/routes.js passed
// every other test.
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var http = require('http');
var path = require('path');
var createServer = require('../../server').createServer;

var APP = path.join(__dirname, '..', '..');

function getJson(port, p, cb) {
  http
    .get({ port: port, path: p, headers: { 'x-staff-id': '1' } }, function (res) {
      var chunks = [];
      res.on('data', function (c) {
        chunks.push(c);
      });
      res.on('end', function () {
        try {
          assert.equal(res.statusCode, 200, p);
          cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          cb(e);
        }
      });
    })
    .on('error', cb);
}

function dates(inv) {
  return inv.number + ' ' + inv.issued_at + ' ' + inv.due_at;
}

test('GET /api/invoices and /api/invoices/:id return the stored YYYY-MM-DD dates', { timeout: 10000 }, function (t, done) {
  var stored = JSON.parse(fs.readFileSync(path.join(APP, 'data', 'invoices.json'), 'utf8'));
  var server = createServer();
  t.after(function () {
    server.close();
  });
  server.listen(0, function () {
    var port = server.address().port;
    getJson(port, '/api/invoices', function (err, list) {
      if (err) return done(err);
      getJson(port, '/api/invoices/' + stored[0].id, function (err2, one) {
        if (err2) return done(err2);
        try {
          assert.match(stored[0].issued_at, /^\d{4}-\d{2}-\d{2}$/);
          assert.deepEqual(list.map(dates), stored.map(dates));
          assert.equal(dates(one), dates(stored[0]));
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });
});
