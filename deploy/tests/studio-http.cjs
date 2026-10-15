// Standalone local integration harness: real Nest controllers, JWT auth and
// PostgreSQL. Publishing/Temporal and paid OpenAI requests are not invoked.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { ThrottlerModule } = require('@nestjs/throttler');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const root = path.resolve(__dirname, '../../apps/backend/dist');
const lib = (name) =>
  require(path.join(root, 'libraries/nestjs-libraries/src', name));
const back = (name) => require(path.join(root, 'apps/backend/src', name));
const { PrismaService } = lib('database/prisma/prisma.service.js');
const { StudioAccessService } = lib('database/prisma/studio-access.service.js');
const { StudioController } = back('api/routes/studio.controller.js');
const { AuthController } = back('api/routes/auth.controller.js');
const { UsersController } = back('api/routes/users.controller.js');
const { AuthService } = back('services/auth/auth.service.js');
const { AuthMiddleware } = back('services/auth/auth.middleware.js');
const { PoliciesGuard } = back(
  'services/auth/permissions/permissions.guard.js'
);
const { InternalAuthGuard } = back('services/auth/internal-auth.guard.js');
const { PostsService } = lib('database/prisma/posts/posts.service.js');
const { PostsRepository } = lib('database/prisma/posts/posts.repository.js');
const { InstagramStandaloneProvider } = lib(
  'integrations/social/instagram.standalone.provider.js'
);
const { UsersService } = lib('database/prisma/users/users.service.js');
const { OrganizationService } = lib(
  'database/prisma/organizations/organization.service.js'
);
const { SubscriptionService } = lib(
  'database/prisma/subscriptions/subscription.service.js'
);
const { EmailService } = lib('services/email.service.js');
const { PaymentService } = lib('services/payment/payment.service.js');
const { TrackService } = lib('track/track.service.js');
const { AuthService: Crypto } = require(path.join(
  root,
  'libraries/helpers/src/auth/auth.service.js'
));
const { encryptStudioKey, decryptStudioKey } = back(
  'api/routes/studio.crypto.js'
);
let db, app, orgId, ownerId;
(async () => {
  assert.match(
    new URL(process.env.DATABASE_URL).pathname,
    /^\/lrmsosmed_studio_test_[a-z0-9]+$/
  );
  db = new PrismaService();
  const access = new StudioAccessService(db);
  const org = await db.organization.create({
    data: { name: 'Fixture Studio', apiKey: randomBytes(20).toString('hex') },
  });
  orgId = org.id;
  const owner = await db.user.create({
    data: {
      username: 'owner-' + randomBytes(6).toString('hex'),
      name: 'Fixture Owner',
      email: randomUUID() + '@internal.invalid',
      providerName: 'LOCAL',
      timezone: 420,
      isSuperAdmin: true,
    },
  });
  ownerId = owner.id;
  await db.userOrganization.create({
    data: { userId: owner.id, organizationId: orgId, role: 'SUPERADMIN' },
  });
  await db.integration.createMany({
    data: ['instagram-standalone', 'threads'].map((provider, i) => ({
      name: 'Account ' + i,
      organizationId: orgId,
      internalId: randomUUID(),
      providerIdentifier: provider,
      type: 'social',
      token: 'disabled-test-record-not-a-platform-credential',
      disabled: true,
    })),
  });
  const users = {
    getUserById: (id) => db.user.findFirst({ where: { id, deletedAt: null } }),
    getUserByUsername: (username) =>
      db.user.findFirst({
        where: {
          username: username.toLowerCase(),
          providerName: 'LOCAL',
          deletedAt: null,
        },
      }),
  };
  const organizations = {
    getOrgsByUserId: (userId) =>
      db.organization.findMany({
        where: { deletedAt: null, users: { some: { userId } } },
        include: {
          users: { where: { userId }, select: { role: true, disabled: true } },
        },
      }),
    getCount: () => db.organization.count(),
  };
  const auth = new AuthService(users, organizations, {}, {});
  const repository = new PostsRepository(...Array(6).fill({ model: db }));
  const posts = new PostsService(
    repository,
    { getSocialIntegration: () => new InstagramStandaloneProvider() },
    {
      getIntegrationById: (organizationId, id) =>
        db.integration.findFirst({ where: { id, organizationId } }),
    },
    {},
    {},
    {},
    {
      client: {
        getRawClient: () => ({ workflow: { list: async function* () {} } }),
      },
    },
    {},
    access
  );

  class TestModule {}
  Module({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
    controllers: [StudioController, AuthController, UsersController],
    providers: [
      { provide: PrismaService, useValue: db },
      { provide: StudioAccessService, useValue: access },
      { provide: PostsService, useValue: posts },
      { provide: UsersService, useValue: users },
      { provide: OrganizationService, useValue: organizations },
      { provide: AuthService, useValue: auth },
      ...[EmailService, PaymentService, SubscriptionService, TrackService].map(
        (provide) => ({ provide, useValue: {} })
      ),
      InternalAuthGuard,
    ],
  })(TestModule);
  app = await NestFactory.create(TestModule, {
    logger: ['error'],
    abortOnError: false,
  });
  app.use(cookieParser());
  const middleware = new AuthMiddleware(organizations, users);
  app.use((req, res, next) =>
    req.path.startsWith('/auth')
      ? next()
      : middleware
          .use(req, res, next)
          .catch(() => res.status(403).json({ message: 'Forbidden' }))
  );
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalGuards(new PoliciesGuard(new Reflector(), {}));
  await app.listen(0, '127.0.0.1');
  const api = await app.getUrl();
  const message = await require('./studio-smoke.cjs')({
    db,
    api,
    cookie: 'auth=' + Crypto.signJWT({ id: owner.id }),
    orgId,
    userId: owner.id,
  });
  // Worker checks resolve membership from the database on every publish attempt.
  const account = await db.integration.findFirst({
    where: { organizationId: orgId },
  });
  await db.integration.update({
    where: { id: account.id },
    data: { disabled: false },
  });
  const member = await db.user.create({
    data: {
      username: 'worker-' + randomBytes(6).toString('hex'),
      email: randomUUID() + '@internal.invalid',
      providerName: 'LOCAL',
      timezone: 420,
    },
  });
  await db.userOrganization.create({
    data: { userId: member.id, organizationId: orgId },
  });
  await db.studioAccess.create({
    data: {
      userId: member.id,
      organizationId: orgId,
      accounts: [account.id],
      permissions: ['schedule'],
    },
  });
  const queued = await db.post.create({
    data: {
      organizationId: orgId,
      integrationId: account.id,
      content: 'worker fixture',
      group: randomUUID(),
      publishDate: new Date(),
      studioAuthorId: member.id,
      studioAction: 'schedule',
      state: 'QUEUE',
    },
  });
  await access.assertPublishing(orgId, [queued.id]);
  const { PostActivity } = require(path.resolve(
    __dirname,
    '../../apps/orchestrator/dist/apps/orchestrator/src/activities/post.activity.js'
  ));
  const activity = Object.create(PostActivity.prototype);
  let providerCalls = 0;
  const provider = {
    editor: 'normal',
    postPending: async () => {
      providerCalls++;
      return [
        { id: queued.id, pendingData: { container: 'fixture-container' } },
      ];
    },
    checkPostStatus: async (_token, data) => {
      assert.equal(data.__lrmPostIds, undefined);
      return { status: 'ready', pendingData: { container: 'fixture-next' } };
    },
    finalizePost: async (_token, data) => {
      assert.equal(data.__lrmPostIds, undefined);
      return { status: 'pending', pendingData: { container: 'fixture-final' } };
    },
  };
  activity._integrationManager = { getSocialIntegration: () => provider };
  activity._postService = {
    assertStudioPublishing: (org, ids) => access.assertPublishing(org, ids),
    updateTags: async () => [queued],
    updateMedia: async () => [],
  };
  activity._temporalService = {};
  const pending = await activity.postSocialBody(account, [queued], true);
  assert.deepEqual(pending[0].pendingData.__lrmPostIds, [queued.id]);
  const ready = await activity.checkPostStatus(account, pending[0].pendingData);
  assert.deepEqual(ready.pendingData.__lrmPostIds, [queued.id]);
  const finalized = await activity.finalizePost(account, ready.pendingData);
  assert.deepEqual(finalized.pendingData.__lrmPostIds, [queued.id]);
  assert.equal(providerCalls, 1);

  await db.studioAccess.updateMany({
    where: { userId: member.id },
    data: { accounts: [] },
  });
  await assert.rejects(access.assertPublishing(orgId, [queued.id]));
  await assert.rejects(activity.finalizePost(account, ready.pendingData));
  await assert.rejects(activity.postSocialBody(account, [queued], true));
  assert.equal(providerCalls, 1);
  await db.studioAccess.updateMany({
    where: { userId: member.id },
    data: { accounts: [account.id], permissions: [] },
  });
  await assert.rejects(access.assertPublishing(orgId, [queued.id]));
  const encrypted = encryptStudioKey('fixture-private-key', owner.id);
  assert.equal(decryptStudioKey(encrypted, owner.id), 'fixture-private-key');
  assert.throws(() => decryptStudioKey(encrypted, member.id));
  assert.throws(() =>
    decryptStudioKey(encrypted.slice(0, -5) + 'AAAAA', owner.id)
  );
  console.log(
    JSON.stringify({
      passed: [
        message,
        'worker stops revoked grants and preserves authorization through pending/finalize',
        'authenticated encryption rejects other users and tampering',
      ],
    })
  );
})()
  .catch((error) => {
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : 'Studio integration harness failed: ' + error.name
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    if (db && orgId) {
      const members = await db.userOrganization.findMany({
        where: { organizationId: orgId },
        select: { userId: true },
      });
      const ids = members.map((m) => m.userId);
      await db.post.deleteMany({ where: { organizationId: orgId } });
      await db.studioAccess.deleteMany({ where: { organizationId: orgId } });
      await db.studioCredential.deleteMany({ where: { userId: { in: ids } } });
      await db.media.deleteMany({ where: { organizationId: orgId } });
      await db.integration.deleteMany({ where: { organizationId: orgId } });
      await db.userOrganization.deleteMany({
        where: { organizationId: orgId },
      });
      await db.organization.delete({ where: { id: orgId } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (db) await db.$disconnect();
    lib('redis/redis.service.js').ioRedis.disconnect();
    require(path.resolve(
      __dirname,
      '../../apps/orchestrator/dist/libraries/nestjs-libraries/src/redis/redis.service.js'
    )).ioRedis.disconnect();
  });
