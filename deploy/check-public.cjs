const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const origin = new URL(process.env.PUBLIC_URL);
assert.equal(origin.protocol, 'https:');
async function verify() {
  const health = await fetch(new URL('/healthz', origin), { signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const catalog = await fetch(new URL('/api/integrations', origin), { signal: AbortSignal.timeout(15000) });
  assert.equal(catalog.status, 200);
  assert.deepEqual((await catalog.json()).social.map(p => p.identifier).sort(),
    ['instagram', 'instagram-standalone', 'threads', 'tiktok', 'tiktok-business']);
  const database = await fetch(new URL('/api/auth/can-register', origin), { signal: AbortSignal.timeout(15000) });
  assert.equal(database.status, 200);
  assert.equal(typeof (await database.json()).register, 'boolean');
  const login = await fetch(new URL('/auth/login', origin), { signal: AbortSignal.timeout(15000) });
  assert.equal(login.status, 200);
  assert.match(await login.text(), /LRM Corporation/);
}
(async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    try { await verify(); console.log('HTTPS_VERIFIED: health, channel catalog, and LRM login'); return; }
    catch (error) { if (attempt === 5) throw error; await delay(10000); }
  }
})().catch(() => { console.error('HTTPS verification failed. Inspect DNS, the NPM target network, and TLS configuration.'); process.exit(1); });
