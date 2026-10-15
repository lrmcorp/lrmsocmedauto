require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InstagramStandaloneProvider, instagramGrantedScopes } = require('../../apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.js');
const required = new InstagramStandaloneProvider().scopes;
const short = { access_token: 'fixture-short-token', permissions: required };
const long = { access_token: 'fixture-long-token', expires_in: 5184000 };
const profile = { user_id: 'fixture-instagram-id', username: 'fixture_account', name: 'Fixture Account' };
const grants = required.map(permission => ({ permission, status: 'granted' }));

async function authenticate(responses) {
  const original = global.fetch;
  const pending = [...responses];
  global.fetch = async () => {
    assert.ok(pending.length, 'Unexpected additional request');
    const item = pending.shift();
    if (item instanceof Error) throw item;
    return { ok: (item.status || 200) === 200, status: item.status || 200, json: async () => item.body ?? item };
  };
  try {
    return await new InstagramStandaloneProvider().authenticate({ code: 'fixture-code', codeVerifier: '', refresh: '' });
  } finally { global.fetch = original; }
}

test('normalizes encoded comma/space strings and preserves all required grants', () => {
  assert.deepEqual(instagramGrantedScopes(encodeURIComponent(required.join(', '))), required);
  assert.deepEqual(instagramGrantedScopes(required.join('+')), required);
  assert.deepEqual(instagramGrantedScopes(grants), required);
  assert.deepEqual(instagramGrantedScopes(undefined), []);
  assert.deepEqual(instagramGrantedScopes('%malformed'), []);
  assert.deepEqual(instagramGrantedScopes([{ permission: required[0], status: 'declined' }]), []);
});
test('full short-token grants authorize without a permissions fallback', async () => {
  const result = await authenticate([short, long, profile]);
  assert.equal(result.username, profile.username);
  assert.equal(result.accessToken, long.access_token);
});
test('comma-separated grants containing spaces no longer fail scope validation', async () => {
  const result = await authenticate([{ ...short, permissions: required.join(', ') }, long, profile]);
  assert.equal(result.id, profile.user_id);
});
test('missing exchange permission metadata is verified with the granted-permissions endpoint', async () => {
  const result = await authenticate([{ access_token: short.access_token }, long, { data: grants }, profile]);
  assert.equal(result.username, profile.username);
});
test('incomplete exchange metadata is replaced by actual token grants', async () => {
  const result = await authenticate([{ ...short, permissions: [required[0]] }, long, { data: grants }, profile]);
  assert.equal(result.id, profile.user_id);
});
test('a genuinely declined permission remains blocked and names the missing scope', async () => {
  await assert.rejects(authenticate([{ access_token: short.access_token }, long,
    { data: grants.map((item, i) => i === 3 ? { ...item, status: 'declined' } : item) }]),
    error => error.message.includes(required[3]) && !error.message.includes(long.access_token));
});
test('permission API failure is not mislabeled as missing grants and does not expose Meta body', async () => {
  await assert.rejects(authenticate([{ access_token: short.access_token }, long,
    { status: 400, body: { error: { code: 100, message: 'sensitive fixture-long-token fixture-secret' } } }]),
    error => error.message.includes('permission verification') && error.message.includes('Meta code 100') && !error.message.includes('fixture-long-token') && !error.message.includes('fixture-secret'));
});
test('failed code exchange is reported before any long-token request', async () => {
  await assert.rejects(authenticate([{ status: 400, body: { error: { code: 190, error_subcode: 123, message: 'fixture-secret' } } }]),
    error => error.message.includes('code exchange') && error.message.includes('190') && !error.message.includes('fixture-secret'));
});
test('unusable permission payload never bypasses authorization checks', async () => {
  await assert.rejects(authenticate([{ access_token: short.access_token }, long, { permissions: required }]),
    error => error.message.includes('usable permissions list'));
});
test('network errors never echo an access-token URL', async () => {
  await assert.rejects(authenticate([short, new Error('https://example.invalid?access_token=fixture-secret')]),
    error => error.message.includes('could not reach Meta') && !error.message.includes('fixture-secret'));
});

test('authorization URL requests fresh Instagram login and the four required scopes', async () => {
  const { url } = await new InstagramStandaloneProvider().generateAuthUrl();
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'www.instagram.com');
  assert.equal(parsed.searchParams.get('force_authentication'), '1');
  assert.deepEqual(instagramGrantedScopes(parsed.searchParams.get('scope')), required);
});
