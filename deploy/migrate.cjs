// Additive migration before Prisma schema sync. Never drops existing columns/data.
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const tables = await db.$queryRaw`SELECT to_regclass('public."User"')::text AS name`;
  if (!tables[0].name) return; // Fresh installations are created by Prisma.
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT');
    await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User" ("username")');
    await tx.$executeRawUnsafe('ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "studioOwnerId" TEXT');
    await tx.$executeRawUnsafe('ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "studioAuthorId" TEXT');
    await tx.$executeRawUnsafe('ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "studioAction" TEXT');
  });
  console.log('Additive internal studio migration complete; existing users and content preserved.');
})().catch(() => {
  console.error('Additive username migration failed; inspect project database privately. No destructive migration flags are used.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
