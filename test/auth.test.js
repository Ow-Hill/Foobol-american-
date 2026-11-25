// Optional site password (lib/auth.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeAuth } = require('../lib/auth');

const req = (url, pass, ip = '1.2.3.4') => ({
  url,
  headers: pass == null ? { 'cf-connecting-ip': ip } : { 'cf-connecting-ip': ip, authorization: 'Basic ' + Buffer.from('any:' + pass).toString('base64') },
  socket: { remoteAddress: '127.0.0.1' },
});

test('no SITE_PASSWORD: everything is open, as before', () => {
  const a = makeAuth('');
  assert.equal(a.enabled, false);
  assert.equal(a.check(req('/')), null);
});

test('with a password: asks, accepts the right one, rejects the wrong one, health stays open', () => {
  const a = makeAuth('correct horse battery');
  assert.equal(a.check(req('/')).status, 401);
  assert.match(a.check(req('/')).headers['WWW-Authenticate'], /^Basic/);
  assert.equal(a.check(req('/api/snapshot', 'correct horse battery')), null);
  assert.equal(a.check(req('/', 'wrong')).status, 401);
  assert.equal(a.check(req('/api/health')), null);
});

test('ten wrong passwords lock that client out for 10 minutes, not others', () => {
  let t = 0;
  const a = makeAuth('correct horse battery', () => t);
  for (let i = 0; i < 10; i++) a.check(req('/', 'nope' + i, '9.9.9.9'));
  assert.equal(a.check(req('/', 'correct horse battery', '9.9.9.9')).status, 429);
  assert.equal(a.check(req('/', 'correct horse battery', '8.8.8.8')), null);
  t = 11 * 60 * 1000;
  assert.equal(a.check(req('/', 'correct horse battery', '9.9.9.9')), null);
});
