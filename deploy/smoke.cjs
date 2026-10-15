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
  for (const provider of ['GOOGLE', 'GITHUB', 'APPLE', 'GENERIC', 'FARCASTER', 'WALLET']) {
    const oauth = await fetch(`${api}/auth/oauth/${provider}`);
    assert.equal(oauth.status, 403, `External login must be disabled: ${provider}`);
    const externalRegister = await fetch(`${api}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    assert.equal(externalRegister.status, 403);
  }
  const tokenLogin = await fetch(`${api}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'LOCAL', providerToken: 'not-a-real-token' }),
  });
  assert.equal(tokenLogin.status, 403);
  assert.equal((await json(`${api}/auth/can-register`)).register, false);
  const blocked = await fetch(`${api}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'LOCAL' }) });
  assert.equal(blocked.status, 403);
  const username = `smoke-${randomBytes(8).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  const { spawnSync } = require('node:child_process');
  const provision = spawnSync(process.execPath, [path.join(__dirname, 'provision-owner.cjs')], {
    input: JSON.stringify({ username, password }), encoding: 'utf8',
  });
  assert.equal(provision.status, 0, 'Private owner provisioning must succeed on the disposable empty database');
  const owner = await db.user.findUnique({ where: { username }, include: { organizations: true } });
  userId = owner.id; orgId = owner.organizations[0].organizationId;
  assert.equal(owner.isSuperAdmin, true); assert.equal(owner.organizations[0].role, 'SUPERADMIN');
  const email = owner.email;
  const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.toUpperCase(), password, provider: 'LOCAL' }) });
  assert.equal(login.status, 200); assert.deepEqual(await login.json(), { login: true });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('auth='));
  for (const credentials of [{ username, password: 'incorrect' }, { email, password }]) {
    const wrong = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials, provider: 'LOCAL' }) });
    assert.equal(wrong.status, 400);
  }
  const signupPage = await fetch(`${base}/auth?provider=GOOGLE`);
  assert.match(new URL(signupPage.url).pathname, /^\/auth\/login$/);
  const markup = await signupPage.text();
  assert.ok(!markup.includes('Create Account'));
  assert.match(markup, /Username/);
  passed.push('username login, invalid credentials, email login rejection, and no public signup');
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
  passed.push(await require('./tests/studio-smoke.cjs')({ db, api, cookie, orgId, userId }));
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
  for (const route of ['/auth/login', '/launches', '/media', '/studio']) {
    const page = await fetch(`${base}${route}`, { headers }); assert.equal(page.status, 200);
    assert.match(await page.text(), /LRM Corporation/);
  }
  for (const asset of ['/branding/lrm-icon-32.png', '/branding/lrm-icon-192.png', '/branding/lrm-logo.webp', '/favicon.ico']) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 200);
    assert.equal(response.redirected, false, 'Brand assets must not redirect to login');
    assert.match(response.headers.get('Content-Type'), /^image\//);
  }
  passed.push('public official logo and browser icon assets');
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
