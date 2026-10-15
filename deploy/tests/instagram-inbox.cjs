require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  StudioInboxService,
} = require('../../apps/backend/dist/apps/backend/src/api/routes/studio.inbox.service.js');
process.env.JWT_SECRET ||=
  'fixture-secret-key-for-inbox-tests-with-at-least-32-characters';
const token = 'fixture-private-instagram-token';
function fixture({
  permissions = ['messages', 'reply'],
  old = false,
  rejected = false,
} = {}) {
  const calls = [];
  const db = {
    integration: {
      findFirst: async () => ({ id: 'ig1', internalId: '100', token }),
    },
  };
  const access = {
    require: async (org, user, permission, id) => {
      if (
        org !== 'org1' ||
        !['member1', 'member2'].includes(user) ||
        id !== 'ig1' ||
        !permissions.includes(permission)
      )
        throw new Error('Forbidden fixture');
    },
  };
  const service = new StudioInboxService(db, access);
  const fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://graph.instagram.com');
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    assert.equal(url.includes(token), false);
    calls.push({ url, options });
    if (rejected)
      return new Response(JSON.stringify({ error: { message: token } }), {
        status: 400,
      });
    const body =
      options.method === 'POST'
        ? { message_id: 'fixture-sent' }
        : url.includes('/conversations?')
        ? {
            data: [
              {
                id: 'conv1',
                participants: {
                  data: [{ id: '100' }, { id: '200', username: 'customer' }],
                },
              },
            ],
          }
        : {
            data: [
              {
                id: 'message1',
                message: 'Halo',
                from: { id: '200' },
                created_time: old
                  ? '2000-01-01T00:00:00Z'
                  : new Date().toISOString(),
              },
            ],
          };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { service, calls, fetch };
}
async function withFixture(options, fn) {
  const f = fixture(options),
    original = global.fetch;
  global.fetch = f.fetch;
  try {
    await fn(f);
  } finally {
    global.fetch = original;
  }
}
test('lists and reads scoped conversations without returning the Instagram token', () =>
  withFixture({}, async ({ service }) => {
    const list = await service.conversations('org1', 'member1', 'ig1');
    assert.equal(list.threads[0].name, 'customer');
    assert.equal(JSON.stringify(list).includes(token), false);
    const result = await service.messages(
      'org1',
      'member1',
      'ig1',
      list.threads[0].handle
    );
    assert.equal(result.messages[0].text, 'Halo');
    assert.equal(result.canReply, true);
  }));
test('a thread handle cannot be reused by another member or altered', () =>
  withFixture({}, async ({ service, calls }) => {
    const list = await service.conversations('org1', 'member1', 'ig1');
    const handle = list.threads[0].handle;
    await assert.rejects(service.messages('org1', 'member2', 'ig1', handle));
    await assert.rejects(
      service.messages('org1', 'member1', 'ig1', handle + 'altered')
    );
    assert.equal(calls.length, 1);
  }));
test('unassigned accounts and missing read permission are rejected before Meta calls', () =>
  withFixture({ permissions: [] }, async ({ service, calls }) => {
    await assert.rejects(service.conversations('org1', 'member1', 'ig1'));
    await assert.rejects(service.conversations('org1', 'member1', 'ig2'));
    assert.equal(calls.length, 0);
  }));
test('read-only access never sends replies', () =>
  withFixture({ permissions: ['messages'] }, async ({ service, calls }) => {
    const list = await service.conversations('org1', 'member1', 'ig1');
    await assert.rejects(
      service.reply('org1', 'member1', 'ig1', list.threads[0].handle, 'Balasan')
    );
    assert.equal(
      calls.some((c) => c.options.method === 'POST'),
      false
    );
  }));
test('reply recipient is derived from the signed conversation and gated by the incoming message window', () =>
  withFixture({}, async ({ service, calls }) => {
    const list = await service.conversations('org1', 'member1', 'ig1');
    await service.reply(
      'org1',
      'member1',
      'ig1',
      list.threads[0].handle,
      'Terima kasih'
    );
    const sent = calls.filter((c) => c.options.method === 'POST');
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0].options.body), {
      recipient: { id: '200' },
      message: { text: 'Terima kasih' },
    });
  }));
test('expired reply windows never send a message', () =>
  withFixture({ old: true }, async ({ service, calls }) => {
    const list = await service.conversations('org1', 'member1', 'ig1');
    await assert.rejects(
      service.reply('org1', 'member1', 'ig1', list.threads[0].handle, 'No send')
    );
    assert.equal(
      calls.some((c) => c.options.method === 'POST'),
      false
    );
  }));
test('Meta rejection does not reveal a token or raw provider body', () =>
  withFixture({ rejected: true }, async ({ service }) => {
    await assert.rejects(
      service.conversations('org1', 'member1', 'ig1'),
      (error) =>
        error.message.includes('instagram_business_manage_messages') &&
        !error.message.includes(token)
    );
  }));
