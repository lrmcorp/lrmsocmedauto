require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
// Constructor dependencies are test doubles: loading their real modules starts
// unrelated Redis/Temporal clients before any service is constructed.
const Module = require('node:module');
const originalLoad = Module._load;
const doubles = {
  'subscription.service': 'SubscriptionService',
  'posts.service': 'PostsService',
  'integration.service': 'IntegrationService',
  'webhooks.service': 'WebhooksService',
};
Module._load = function(request, ...args) {
  for (const [suffix, name] of Object.entries(doubles)) {
    if (request.endsWith('/' + suffix)) return { [name]: class {} };
  }
  return originalLoad.call(this, request, ...args);
};
const { PermissionsService } = require('../../apps/backend/dist/apps/backend/src/services/auth/permissions/permissions.service.js');
Module._load = originalLoad;
const { AuthorizationActions: Actions, Sections } = require('../../apps/backend/dist/apps/backend/src/services/auth/permissions/permission.exception.class.js');
const { PoliciesGuard } = require('../../apps/backend/dist/apps/backend/src/services/auth/permissions/permissions.guard.js');

test('disabling billing does not give ordinary members workspace administrator access', async () => {
  const previous = process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  try {
    const service = new PermissionsService({}, {}, {}, {});
    const requested = [[Actions.Create, Sections.TEAM_MEMBERS], [Actions.Create, Sections.ADMIN]];
    const member = await service.check('fixture-workspace', new Date(), 'USER', requested);
    assert.equal(member.can(Actions.Create, Sections.ADMIN), false);
    assert.equal(requested.every(([action, section]) => member.can(action, section)), false);
    for (const role of ['ADMIN', 'SUPERADMIN']) {
      const manager = await service.check('fixture-workspace', new Date(), role, requested);
      assert.equal(requested.every(([action, section]) => manager.can(action, section)), true);
    }
    const ordinary = await service.check('fixture-workspace', new Date(), 'USER', [[Actions.Create, Sections.POSTS_PER_MONTH]]);
    assert.equal(ordinary.can(Actions.Create, Sections.POSTS_PER_MONTH), true);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
    else process.env.STRIPE_PUBLISHABLE_KEY = previous;
  }
});

test('billing-enabled permission checks still require an administrator role', async () => {
  const previous = process.env.STRIPE_PUBLISHABLE_KEY;
  process.env.STRIPE_PUBLISHABLE_KEY = 'fixture-publishable-key';
  try {
    const service = new PermissionsService({ getSubscriptionByOrganizationId: async () => null }, {}, {}, {});
    for (const role of ['USER', 'ADMIN', 'SUPERADMIN']) {
      const ability = await service.check('fixture-workspace', new Date(), role, [[Actions.Create, Sections.ADMIN]]);
      assert.equal(ability.can(Actions.Create, Sections.ADMIN), role !== 'USER');
    }
  } finally {
    if (previous === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
    else process.env.STRIPE_PUBLISHABLE_KEY = previous;
  }
});

test('the API guard rejects a member calling a protected team administration endpoint', async () => {
  const previous = process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  try {
    const policies = [[Actions.Create, Sections.TEAM_MEMBERS], [Actions.Create, Sections.ADMIN]];
    const guard = new PoliciesGuard({ get: () => policies }, new PermissionsService({}, {}, {}, {}));
    const request = { path: '/settings/team', query: {}, org: {
      id: 'fixture-workspace', createdAt: new Date(), users: [{ role: 'USER' }],
    } };
    const context = { getHandler: () => () => {}, switchToHttp: () => ({ getRequest: () => request }) };
    await assert.rejects(guard.canActivate(context));
    request.org.users[0].role = 'SUPERADMIN';
    assert.equal(await guard.canActivate(context), true);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
    else process.env.STRIPE_PUBLISHABLE_KEY = previous;
  }
});
