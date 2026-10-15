import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export const STUDIO_PERMISSIONS = [
  'draft',
  'schedule',
  'publish',
  'delete',
  'analytics',
  'ai',
] as const;
export type StudioPermission = (typeof STUDIO_PERMISSIONS)[number];
export const STUDIO_PROVIDERS = [
  'instagram',
  'instagram-standalone',
  'threads',
  'tiktok',
  'tiktok-business',
];

@Injectable()
export class StudioAccessService {
  constructor(private db: PrismaService) {}

  async context(orgId: string, userId: string) {
    const member = await this.db.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      include: { user: { select: { activated: true, deletedAt: true } } },
    });
    if (
      !member ||
      member.disabled ||
      !member.user.activated ||
      member.user.deletedAt
    ) {
      throw new ForbiddenException('Keanggotaan tidak aktif.');
    }
    const owner = member.role === 'SUPERADMIN';
    const policy = owner
      ? null
      : await this.db.studioAccess.findUnique({
          where: { userId_organizationId: { userId, organizationId: orgId } },
        });
    return {
      owner,
      accounts: policy?.accounts || [],
      permissions: owner ? [...STUDIO_PERMISSIONS] : policy?.permissions || [],
    };
  }

  async require(
    orgId: string,
    userId: string,
    permission?: StudioPermission,
    accountId?: string
  ) {
    const access = await this.context(orgId, userId);
    if (permission && !access.permissions.includes(permission))
      throw new ForbiddenException('Izin tindakan ini belum diberikan.');
    if (accountId && !access.owner && !access.accounts.includes(accountId))
      throw new ForbiddenException('Akun ini tidak ditugaskan kepada Anda.');
    return access;
  }

  async assertPublishing(orgId: string, ids: string[]) {
    const posts = await this.db.post.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      include: {
        integration: {
          select: { disabled: true, deletedAt: true, refreshNeeded: true },
        },
      },
    });
    if (posts.length !== ids.length)
      throw new ForbiddenException('Konten tidak tersedia.');
    for (const post of posts) {
      if (post.deletedAt || post.state === 'DRAFT')
        throw new ForbiddenException('Konten sudah dibatalkan.');
      if (!post.studioAuthorId) continue; // Existing owner workflows retain their behavior.
      if (
        post.integration.disabled ||
        post.integration.deletedAt ||
        post.integration.refreshNeeded
      )
        throw new ForbiddenException('Koneksi akun tidak aktif.');
      await this.require(
        orgId,
        post.studioAuthorId,
        post.studioAction === 'now' ? 'publish' : 'schedule',
        post.integrationId
      );
    }
  }
}
