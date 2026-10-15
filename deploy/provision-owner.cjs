// Run only through the VPS administrator helper; never exposed as an HTTP endpoint.
const { readFileSync } = require('node:fs');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { AuthService } = require('../apps/backend/dist/libraries/helpers/src/auth/auth.service.js');
const db = new PrismaClient();
class ProvisionError extends Error {}
(async () => {
  const input = readFileSync(0);
  if (input.length > 16384) throw new ProvisionError('Invalid input');
  const { username: rawUsername, password, existingEmail = '' } = JSON.parse(input.toString());
  const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new ProvisionError('Username must contain 3-32 letters, digits, dots, underscores, or hyphens');
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) throw new ProvisionError('Password must contain at least 12 characters and at most 72 UTF-8 bytes');
  const hashed = AuthService.hashPassword(password);
  await db.$transaction(async tx => {
    const taken = await tx.user.findUnique({ where: { username } });
    const existing = existingEmail ? await tx.user.findFirst({
      where: { email: { equals: existingEmail.trim(), mode: 'insensitive' }, providerName: 'LOCAL', deletedAt: null },
      include: { organizations: true },
    }) : null;
    if (existingEmail && !existing) throw new ProvisionError('Existing local owner account not found');
    if (taken && taken.id !== existing?.id) throw new ProvisionError('Username is already assigned; use the existing owner email to update it');
    if (existing) {
      if (!existing.organizations.some(member => member.role === 'SUPERADMIN' && !member.disabled)) throw new ProvisionError('Selected account is not a workspace owner');
      await tx.user.update({ where: { id: existing.id }, data: { username, password: hashed, activated: true, isSuperAdmin: true } });
    } else {
      if (await tx.user.count() || await tx.organization.count()) throw new ProvisionError('Existing data found. Enter the existing owner email; no accounts were changed');
      await tx.organization.create({ data: {
        name: 'LRM Corporation', apiKey: AuthService.fixedEncryption(randomBytes(24).toString('hex')),
        allowTrial: false, isTrailing: false,
        users: { create: { role: 'SUPERADMIN', user: { create: {
          username, email: `owner-${randomUUID()}@internal.invalid`, password: hashed,
          providerName: 'LOCAL', activated: true, isSuperAdmin: true, timezone: 420, name: 'LRM Owner',
        } } } },
      } });
    }
  });
  console.log('OWNER_READY: username configured; workspace owner and system administrator enabled. Password not displayed.');
})().catch(error => {
  // Prisma exceptions can include input values: publish only our explicit messages.
  const message = error instanceof ProvisionError ? error.message : 'Owner provisioning failed; no account changes were committed';
  console.error(message);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
