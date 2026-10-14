const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { unlink } = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = process.env.LRM_SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const api = `${base}/api`;
const passed = [];
let orgId, userId, uploadPath;
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  assert.ok([200, 201].includes(response.status), `Unexpected HTTP status at ${new URL(url).pathname}: ${response.status}`);
  return response.json();
}
(async () => {
  assert.equal(process.env.LRM_SMOKE_TEST, 'true', 'Explicit disposable test mode is required');
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Only loopback application requests are permitted');
  assert.equal(new URL(process.env.DATABASE_URL).pathname, '/lrmsosmed_ci', 'Only the disposable CI database is permitted');
  assert.equal(await db.organization.count(), 0, 'Preserve existing users: test database must be empty');
  assert.deepEqual((await json(`${api}/integrations`)).social.map(p => p.identifier).sort(),
    ['instagram', 'instagram-standalone', 'threads', 'tiktok', 'tiktok-business']);
  passed.push('restricted channel catalog');
  assert.deepEqual(await json(`${base}/healthz`), { status: 'ok' });
  passed.push('worker and Temporal readiness');
  assert.equal((await json(`${api}/auth/can-register`)).register, true);
  const email = `lrmsosmed-smoke-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString('hex');
  const body = { email, password, provider: 'LOCAL', company: 'LRMSosmed Disposable Test' };
  const register = await fetch(`${api}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const user = await db.user.findFirst({ where: { email }, include: { organizations: true } });
  if (user) { userId = user.id; orgId = user.organizations[0].organizationId; }
  assert.equal(register.status, 200); assert.deepEqual(await register.json(), { register: true });
  const cookie = register.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('auth='));
  assert.equal((await json(`${api}/auth/can-register`)).register, false);
  const blocked = await fetch(`${api}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, email: `second-${email}` }) });
  assert.equal(blocked.status, 400); assert.match(await blocked.text(), /Registration is disabled/);
  const login = await json(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, provider: 'LOCAL' }) });
  assert.deepEqual(login, { login: true });
  const wrong = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'incorrect', provider: 'LOCAL' }) });
  assert.equal(wrong.status, 400);
  passed.push('registration, login, and private registration controls');
  const headers = { Cookie: cookie };
  const self = await json(`${api}/user/self`, { headers });
  assert.equal(self.orgId, orgId); assert.equal(self.email, email); assert.ok(self.totalChannels > 1);
  await db.integration.createMany({ data: ['instagram', 'tiktok', 'threads'].flatMap(provider => [1, 2].map(n => ({
    organizationId: orgId, internalId: `local-test-${provider}-${n}`, name: `${provider} test ${n}`,
    providerIdentifier: provider, type: 'social', disabled: true, token: 'disabled-test-record-not-a-platform-credential',
  }))) });
  const accounts = (await json(`${api}/integrations/list`, { headers })).integrations;
  assert.equal(accounts.length, 6); assert.equal(new Set(accounts.map(p => p.id)).size, 6);
  for (const provider of ['instagram', 'tiktok', 'threads']) assert.equal(accounts.filter(p => p.identifier === provider).length, 2);
  passed.push('two independent account records per network');
  await json(`${api}/posts/list?state=all`, { headers });
  passed.push('authenticated calendar API');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN+8AAAAASUVORK5CYII=', 'base64');
  const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const media = await json(`${api}/media/upload-server`, { method: 'POST', headers, body: form });
  assert.ok(media.id && media.path);
  uploadPath = path.resolve(process.env.UPLOAD_DIRECTORY, new URL(media.path).pathname.replace(/^\/uploads\//, ''));
  assert.ok(uploadPath.startsWith(path.resolve(process.env.UPLOAD_DIRECTORY) + path.sep));
  const download = await fetch(new URL(new URL(media.path).pathname, base));
  assert.equal(download.status, 200); assert.match(download.headers.get('Content-Type'), /image\/png/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  passed.push('media persistence and public download');
  for (const route of ['/auth/login', '/launches', '/media']) {
    const page = await fetch(`${base}${route}`, { headers }); assert.equal(page.status, 200);
    assert.match(await page.text(), /LRM Corporation/);
  }
  passed.push('branded application pages');
  console.log(JSON.stringify({ passed, checks: passed.length }));
})().catch(error => {
  console.error(JSON.stringify({ passed, error: error.name + ': ' + error.message }));
  process.exitCode = 1;
}).finally(async () => {
  if (orgId) {
    await db.media.deleteMany({ where: { organizationId: orgId } });
    await db.integration.deleteMany({ where: { organizationId: orgId } });
    await db.userOrganization.deleteMany({ where: { organizationId: orgId } });
    await db.organization.delete({ where: { id: orgId } });
  }
  if (userId) await db.user.delete({ where: { id: userId } });
  if (uploadPath) await unlink(uploadPath).catch(() => {});
  await db.$disconnect();
});
