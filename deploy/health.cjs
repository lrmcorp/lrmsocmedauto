const assert = require('node:assert/strict');
const expected = ['instagram', 'instagram-standalone', 'threads', 'tiktok', 'tiktok-business'];
(async () => {
  const response = await fetch('http://127.0.0.1:5000/api/integrations', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.deepEqual(catalog.social.map(item => item.identifier).sort(), expected);
  const database = await fetch('http://127.0.0.1:5000/api/auth/can-register', { signal: AbortSignal.timeout(5000) });
  assert.equal(database.status, 200);
  assert.equal(typeof (await database.json()).register, 'boolean');
  const worker = await fetch('http://127.0.0.1:3002/health/status', { signal: AbortSignal.timeout(10000) });
  assert.equal(worker.status, 200);
  assert.equal((await worker.json()).status, 'ok');
})().catch(() => process.exit(1));
