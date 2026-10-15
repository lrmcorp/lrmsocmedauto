const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

// Runs inside the existing, explicitly disposable CI database and real HTTP app.
module.exports = async function studioSmoke({
  db,
  api,
  cookie,
  orgId,
  userId,
}) {
  const owner = { Cookie: cookie, 'Content-Type': 'application/json' };
  const createdIds = [];
  async function request(
    path,
    headers = owner,
    method = 'GET',
    body,
    expected = 200
  ) {
    const response = await fetch(api + '/studio' + path, {
      headers,
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(
      [expected, ...(expected === 200 ? [201] : [])].includes(response.status),
      `Studio ${method} ${path} format=${body?.postType || "default"}: expected ${expected}, received ${response.status}`
    );
    return response.json().catch(() => ({}));
  }
  try {
    const accounts = await db.integration.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
    const [a, b] = accounts;
    const password = randomBytes(24).toString('hex');
    const usernames = [0, 1].map(
      () => 'member-' + randomBytes(6).toString('hex')
    );
    for (let n = 0; n < 2; n++) {
      await request('/members', owner, 'POST', {
        username: usernames[n],
        name: `Fixture Member ${n}`,
        password,
        accounts: [(n ? b : a).id],
        permissions: ['draft', 'analytics', ...(n ? [] : ['ai'])],
        disabled: false,
      });
      createdIds.push(
        (await db.user.findUnique({ where: { username: usernames[n] } })).id
      );
    }
    const memberHeaders = [];
    for (const username of usernames) {
      const response = await fetch(api + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, provider: 'LOCAL' }),
      });
      assert.equal(
        response.status,
        200,
        'New member must log in using username/password'
      );
      memberHeaders.push({
        Cookie: response.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; '),
        'Content-Type': 'application/json',
      });
    }
    for (let n = 0; n < 2; n++) {
      const me = await request('/me', memberHeaders[n]);
      assert.deepEqual(
        me.accounts.map((item) => item.id),
        [(n ? b : a).id]
      );
      assert.equal(me.owner, false);
      assert.equal(
        JSON.stringify(me).includes(
          'disabled-test-record-not-a-platform-credential'
        ),
        false
      );
      const self = await fetch(api + '/user/self', {
        headers: memberHeaders[n],
      });
      assert.equal((await self.json()).publicApi, '');
      for (const path of [
        '/settings/team',
        '/integrations/list',
        '/posts/list?state=all',
        '/media',
        '/user/organizations',
      ]) {
        const denied = await fetch(api + path, { headers: memberHeaders[n] });
        // Missing routes also cannot return data; protected real routes must deny.
        assert.ok(
          [403, 404].includes(denied.status),
          'Member must not use legacy workspace-wide APIs'
        );
      }
    }
    await request('/members', memberHeaders[0], 'GET', undefined, 403);
    await request(
      '/analytics/' + b.id,
      memberHeaders[0],
      'GET',
      undefined,
      403
    );
    await request(
      '/posts',
      memberHeaders[0],
      'POST',
      { integrationId: b.id, action: 'draft', content: 'denied', mediaIds: [] },
      403
    );
    await request(
      '/posts',
      memberHeaders[0],
      'POST',
      {
        integrationId: a.id,
        action: 'schedule',
        content: 'denied',
        mediaIds: [],
        date: new Date(Date.now() + 86400000).toISOString(),
      },
      403
    );
    await request(
      '/posts',
      memberHeaders[0],
      'POST',
      { integrationId: a.id, action: 'now', content: 'denied', mediaIds: [] },
      403
    );
    const fixtures = await Promise.all(
      [a, b].map((integration, n) =>
        db.post.create({
          data: {
            organizationId: orgId,
            integrationId: integration.id,
            content: `scoped-fixture-${n}`,
            group: 'studio-test-' + randomBytes(8).toString('hex'),
            state: 'DRAFT',
            publishDate: new Date(),
          },
        })
      )
    );
    const firstPosts = await request('/posts', memberHeaders[0]);
    assert.ok(firstPosts.some((p) => p.id === fixtures[0].id));
    assert.ok(firstPosts.every((p) => p.integrationId === a.id));
    await request(
      '/posts/' + fixtures[1].id,
      memberHeaders[0],
      'DELETE',
      undefined,
      403
    );
    await db.integration.update({
      where: { id: a.id },
      data: { disabled: false },
    });
    await request('/inbox/' + a.id, memberHeaders[0], 'GET', undefined, 403);
    const testMedia = [];
    for (const ext of ['png', 'png', 'mov'])
      testMedia.push(
        await db.media.create({
          data: {
            organizationId: orgId,
            studioOwnerId: createdIds[0],
            name: 'scoped-format-fixture.' + ext,
            path:
              process.env.FRONTEND_URL +
              '/uploads/scoped-format-fixture-' +
              testMedia.length +
              '.' +
              ext,
          },
        })
      );
    for (const [postType, mediaIds] of [
      ['photo', [testMedia[2].id]],
      ['carousel', [testMedia[0].id]],
      ['reel', [testMedia[0].id]],
      ['story', testMedia.slice(0, 2).map((m) => m.id)],
    ]) {
      await request(
        '/posts',
        memberHeaders[0],
        'POST',
        {
          integrationId: a.id,
          action: 'draft',
          content: 'scoped-fixture-invalid-format',
          mediaIds,
          postType,
        },
        400
      );
    }
    for (const [postType, mediaIds] of [
      ['photo', [testMedia[0].id]],
      ['carousel', [testMedia[1].id, testMedia[0].id]],
      ['reel', [testMedia[2].id]],
      ['story', [testMedia[0].id]],
    ]) {
      const result = await request('/posts', memberHeaders[0], 'POST', {
        integrationId: a.id,
        action: 'draft',
        content: 'scoped-fixture-valid-' + postType,
        mediaIds,
        postType,
      });
      const saved = await db.post.findUnique({
        where: { id: result[0].postId },
      });
      assert.deepEqual(
        JSON.parse(saved.image).map((m) => m.id),
        mediaIds
      );
      assert.equal(
        JSON.parse(saved.settings).post_type,
        postType === 'story' ? 'story' : 'post'
      );
    }
    const created = await request('/posts', memberHeaders[0], 'POST', {
      integrationId: a.id,
      action: 'draft',
      content: 'scoped-fixture-positive-draft',
      mediaIds: [],
    });
    assert.equal(created.length, 1);
    const draft = await db.post.findUnique({
      where: { id: created[0].postId },
    });
    assert.equal(draft.state, 'DRAFT');
    assert.equal(draft.studioAuthorId, createdIds[0]);
    await request('/posts', memberHeaders[0], 'POST', {
      integrationId: a.id,
      action: 'draft',
      content: 'scoped-fixture-positive-edited',
      mediaIds: [],
      postId: draft.id,
    });
    assert.equal(
      (await db.post.findUnique({ where: { id: draft.id } })).content,
      'scoped-fixture-positive-edited'
    );
    await request(
      '/posts/' + draft.id,
      memberHeaders[0],
      'DELETE',
      undefined,
      403
    );
    await request('/members/' + createdIds[0], owner, 'PATCH', {
      accounts: [a.id],
      permissions: ['draft', 'analytics', 'ai', 'delete'],
      disabled: false,
    });
    await request('/posts/' + draft.id, memberHeaders[0], 'DELETE');
    assert.ok(
      (await db.post.findUnique({ where: { id: draft.id } })).deletedAt
    );
    await db.integration.update({
      where: { id: a.id },
      data: { disabled: true },
    });
    const fakeKey = 'sk-' + randomBytes(24).toString('hex');
    await request('/openai', memberHeaders[0], 'PUT', { key: fakeKey });
    const stored = await db.studioCredential.findUnique({
      where: { userId: createdIds[0] },
    });
    assert.ok(!stored.encrypted.includes(fakeKey));
    assert.equal((await request('/me', memberHeaders[0])).aiConfigured, true);
    assert.equal((await request('/me', memberHeaders[1])).aiConfigured, false);
    await request('/openai', memberHeaders[1], 'PUT', { key: fakeKey }, 403);
    await request(
      '/ai',
      memberHeaders[1],
      'POST',
      { type: 'caption', prompt: 'must never reach OpenAI' },
      403
    );
    await request(
      '/members/' + userId,
      owner,
      'PATCH',
      { accounts: [], permissions: [], disabled: true },
      403
    );
    await request('/members/' + createdIds[0], owner, 'PATCH', {
      accounts: [],
      permissions: [],
      disabled: false,
    });
    assert.equal((await request('/me', memberHeaders[0])).accounts.length, 0);
    assert.equal((await request('/posts', memberHeaders[0])).length, 0);
    await request('/members/' + createdIds[0], owner, 'PATCH', {
      accounts: [],
      permissions: [],
      disabled: true,
    });
    // AuthMiddleware invalidates the session when no active membership remains;
    // the production HttpExceptionFilter returns 401 and clears its cookie.
    await request('/me', memberHeaders[0], 'GET', undefined, 401);
    return 'scoped members: username login, account isolation, action permissions, encrypted personal keys, owner protection, immediate revocation';
  } finally {
    await db.studioCredential.deleteMany({
      where: { userId: { in: createdIds } },
    });
    await db.studioAccess.deleteMany({
      where: { organizationId: orgId, userId: { in: createdIds } },
    });
    await db.post.deleteMany({
      where: {
        organizationId: orgId,
        content: { startsWith: 'scoped-fixture-' },
      },
    });
    await db.media.deleteMany({
      where: { organizationId: orgId, studioOwnerId: { in: createdIds } },
    });
    await db.userOrganization.deleteMany({
      where: { organizationId: orgId, userId: { in: createdIds } },
    });
    await db.user.deleteMany({ where: { id: { in: createdIds } } });
  }
};
