import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { Organization, User } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  STUDIO_PERMISSIONS,
  STUDIO_PROVIDERS,
  StudioAccessService,
} from '@gitroom/nestjs-libraries/database/prisma/studio-access.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  StudioAiDto,
  StudioKeyDto,
  StudioMemberDto,
  StudioMemberPolicyDto,
  StudioPasswordDto,
  StudioPostDto,
} from './studio.dto';
import { decryptStudioKey, encryptStudioKey } from './studio.crypto';
import { StudioInboxService } from './studio.inbox.service';
import {
  StudioThreadDto,
  StudioReplyDto,
  StudioInboxQueryDto,
} from './studio.dto';

@Controller('/studio')
export class StudioController {
  constructor(
    private db: PrismaService,
    private access: StudioAccessService,
    private posts: PostsService,
    private inbox: StudioInboxService
  ) {}

  @Get('/inbox/:id')
  conversations(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Query() query: StudioInboxQueryDto
  ) {
    return this.inbox.conversations(org.id, user.id, id, query.after);
  }
  @Post('/inbox/thread')
  messages(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioThreadDto
  ) {
    return this.inbox.messages(
      org.id,
      user.id,
      body.accountId,
      body.handle,
      body.after
    );
  }
  @Post('/inbox/reply')
  reply(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioReplyDto
  ) {
    return this.inbox.reply(
      org.id,
      user.id,
      body.accountId,
      body.handle,
      body.text
    );
  }

  private async owner(org: Organization, user: User) {
    if (!(await this.access.context(org.id, user.id)).owner)
      throw new ForbiddenException(
        'Hanya superowner yang dapat mengelola anggota.'
      );
  }
  private async accounts(org: Organization, user: User) {
    const access = await this.access.context(org.id, user.id);
    return this.db.integration.findMany({
      where: {
        organizationId: org.id,
        deletedAt: null,
        providerIdentifier: { in: STUDIO_PROVIDERS },
        ...(access.owner ? {} : { id: { in: access.accounts } }),
      },
      select: {
        id: true,
        name: true,
        customName: true,
        picture: true,
        providerIdentifier: true,
        disabled: true,
        refreshNeeded: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  @Get('/me')
  async me(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    const policy = await this.access.context(org.id, user.id);
    return {
      username: user.username,
      name: user.name || user.username,
      owner: policy.owner,
      permissions: policy.permissions,
      accounts: await this.accounts(org, user),
      aiConfigured: !!(await this.db.studioCredential.count({
        where: { userId: user.id },
      })),
    };
  }

  @Get('/posts')
  async listPosts(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    const accounts = await this.accounts(org, user);
    return this.db.post.findMany({
      where: {
        organizationId: org.id,
        integrationId: { in: accounts.map((a) => a.id) },
        parentPostId: null,
        deletedAt: null,
      },
      select: {
        id: true,
        content: true,
        state: true,
        publishDate: true,
        integrationId: true,
        group: true,
        image: true,
        releaseURL: true,
        settings: true,
      },
      orderBy: { publishDate: 'desc' },
      take: 200,
    });
  }

  @Get('/summary')
  async summary(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    const accounts = await this.accounts(org, user);
    const counts = await this.db.post.groupBy({
      by: ['state'],
      where: {
        organizationId: org.id,
        integrationId: { in: accounts.map((a) => a.id) },
        parentPostId: null,
        deletedAt: null,
      },
      _count: true,
    });
    return {
      accounts: accounts.length,
      needsReconnect: accounts.filter((a) => a.refreshNeeded).length,
      counts: Object.fromEntries(counts.map((c) => [c.state, c._count])),
    };
  }

  @Get('/analytics/:id')
  async analytics(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    await this.access.require(org.id, user.id, 'analytics', id);
    const exists = await this.db.integration.count({
      where: { id, organizationId: org.id, deletedAt: null },
    });
    if (!exists) throw new ForbiddenException();
    // Read stored publication status without sending a platform API request.
    return this.db.post.groupBy({
      by: ['state'],
      where: {
        organizationId: org.id,
        integrationId: id,
        parentPostId: null,
        deletedAt: null,
      },
      _count: true,
    });
  }

  private async validPolicy(org: Organization, body: StudioMemberPolicyDto) {
    if (
      body.permissions.includes('reply') &&
      !body.permissions.includes('messages')
    )
      throw new BadRequestException(
        'Izin balas DM memerlukan izin baca pesan.'
      );
    if (
      body.permissions.some((p) => ['schedule', 'publish'].includes(p)) &&
      !body.permissions.includes('draft')
    ) {
      throw new BadRequestException(
        'Izin menjadwalkan atau menerbitkan juga memerlukan izin membuat draf.'
      );
    }
    const total = await this.db.integration.count({
      where: {
        id: { in: body.accounts },
        organizationId: org.id,
        deletedAt: null,
        providerIdentifier: { in: STUDIO_PROVIDERS },
      },
    });
    if (total !== body.accounts.length)
      throw new BadRequestException('Pilihan akun tidak valid.');
  }

  @Get('/members')
  async members(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    await this.owner(org, user);
    const members = await this.db.userOrganization.findMany({
      where: { organizationId: org.id },
      select: {
        userId: true,
        role: true,
        disabled: true,
        user: { select: { username: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const policies = await this.db.studioAccess.findMany({
      where: { organizationId: org.id },
    });
    return members.map((m) => ({
      ...m,
      accounts: policies.find((p) => p.userId === m.userId)?.accounts || [],
      permissions:
        m.role === 'SUPERADMIN'
          ? [...STUDIO_PERMISSIONS]
          : policies.find((p) => p.userId === m.userId)?.permissions || [],
    }));
  }

  @Post('/members')
  async createMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioMemberDto
  ) {
    await this.owner(org, user);
    await this.validPolicy(org, body);
    if (Buffer.byteLength(body.password, 'utf8') > 72)
      throw new BadRequestException('Password maksimal 72 byte.');
    const username = body.username.toLowerCase();
    if (await this.db.user.count({ where: { username } }))
      throw new BadRequestException('Username sudah dipakai.');
    const password = AuthService.hashPassword(body.password);
    try {
      await this.db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username,
            name: body.name.trim(),
            password,
            providerName: 'LOCAL',
            email: `${randomUUID()}@internal.invalid`,
            timezone: 420,
            activated: true,
            isSuperAdmin: false,
          },
        });
        await tx.userOrganization.create({
          data: {
            userId: created.id,
            organizationId: org.id,
            role: 'USER',
            disabled: body.disabled,
          },
        });
        await tx.studioAccess.create({
          data: {
            userId: created.id,
            organizationId: org.id,
            accounts: body.accounts,
            permissions: body.permissions,
          },
        });
      });
    } catch {
      throw new BadRequestException(
        'Anggota tidak dapat dibuat; periksa username.'
      );
    }
    return { ok: true };
  }

  private async target(org: Organization, id: string) {
    const member = await this.db.userOrganization.findUnique({
      where: { userId_organizationId: { userId: id, organizationId: org.id } },
      include: { user: { select: { isSuperAdmin: true } } },
    });
    if (!member || member.role === 'SUPERADMIN' || member.user.isSuperAdmin)
      throw new ForbiddenException('Akun pemilik dilindungi.');
    return member;
  }

  @Patch('/members/:id')
  async updateMember(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioMemberPolicyDto
  ) {
    await this.owner(org, user);
    await this.target(org, id);
    await this.validPolicy(org, body);
    await this.db.$transaction([
      this.db.userOrganization.update({
        where: {
          userId_organizationId: { userId: id, organizationId: org.id },
        },
        data: { disabled: body.disabled, role: 'USER' },
      }),
      this.db.studioAccess.upsert({
        where: {
          userId_organizationId: { userId: id, organizationId: org.id },
        },
        create: {
          userId: id,
          organizationId: org.id,
          accounts: body.accounts,
          permissions: body.permissions,
        },
        update: { accounts: body.accounts, permissions: body.permissions },
      }),
    ]);
    return { ok: true };
  }

  @Put('/members/:id/password')
  async password(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: StudioPasswordDto
  ) {
    await this.owner(org, user);
    await this.target(org, id);
    // Password belongs to the identity, so avoid changing another workspace's user.
    if ((await this.db.userOrganization.count({ where: { userId: id } })) !== 1)
      throw new ForbiddenException('Akun ini digunakan di beberapa workspace.');
    if (Buffer.byteLength(body.password, 'utf8') > 72)
      throw new BadRequestException('Password maksimal 72 byte.');
    await this.db.user.update({
      where: { id },
      data: { password: AuthService.hashPassword(body.password) },
    });
    return { ok: true };
  }

  @Put('/openai')
  async saveKey(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioKeyDto
  ) {
    await this.access.require(org.id, user.id, 'ai');
    let encrypted: string;
    try {
      encrypted = encryptStudioKey(body.key, user.id);
    } catch {
      throw new HttpException('Enkripsi server belum siap.', 503);
    }
    await this.db.studioCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, encrypted },
      update: { encrypted },
    });
    return { ok: true };
  }

  @Delete('/openai')
  async removeKey(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    await this.access.context(org.id, user.id);
    await this.db.studioCredential.deleteMany({ where: { userId: user.id } });
    return { ok: true };
  }

  private async saveMedia(org: Organization, user: User, path: string) {
    return this.db.media.create({
      data: {
        organizationId: org.id,
        studioOwnerId: user.id,
        name: path.split('/').pop()!,
        path,
      },
      select: { id: true, path: true, name: true },
    });
  }

  @Get('/media')
  async media(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    await this.access.context(org.id, user.id);
    return this.db.media.findMany({
      where: {
        organizationId: org.id,
        studioOwnerId: user.id,
        deletedAt: null,
      },
      select: { id: true, path: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('/media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    })
  )
  async upload(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @UploadedFile() file: Express.Multer.File
  ) {
    await this.access.require(org.id, user.id, 'draft');
    if (!file) throw new BadRequestException('Pilih gambar atau video.');
    let path: string;
    try {
      path = (await UploadFactory.createStorage().uploadFile(file)).path;
    } catch {
      throw new BadRequestException('Berkas tidak didukung.');
    }
    return this.saveMedia(org, user, path);
  }

  @Post('/ai')
  async generate(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioAiDto
  ) {
    await this.access.require(org.id, user.id, 'ai');
    const credential = await this.db.studioCredential.findUnique({
      where: { userId: user.id },
    });
    if (!credential)
      throw new BadRequestException('Simpan API key OpenAI Anda dahulu.');
    try {
      const client = new OpenAI({
        apiKey: decryptStudioKey(credential.encrypted, user.id),
        timeout: 120000,
        maxRetries: 0,
      });
      if (body.type === 'caption') {
        const result = await client.chat.completions.create({
          model: 'gpt-4.1-mini',
          max_tokens: 1200,
          messages: [
            {
              role: 'system',
              content:
                'Buat caption media sosial sesuai arahan pengguna. Kembalikan teks caption saja.',
            },
            { role: 'user', content: body.prompt },
          ],
        });
        return { text: result.choices[0]?.message?.content || '' };
      }
      const result = await client.images.generate({
        model: 'gpt-image-1',
        prompt: body.prompt,
        size: '1024x1024',
        n: 1,
      });
      if (!result.data?.[0]?.b64_json) throw new Error('Missing image');
      const path = await UploadFactory.createStorage().uploadSimple(
        'data:image/png;base64,' + result.data[0].b64_json
      );
      return { media: await this.saveMedia(org, user, path) };
    } catch {
      // Never forward SDK errors: these can contain Authorization headers or keys.
      throw new BadRequestException(
        'Permintaan AI gagal. Periksa API key, saldo API, dan akses model di akun OpenAI Anda.'
      );
    }
  }

  @Post('/posts')
  async createPost(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: StudioPostDto
  ) {
    await this.access.require(org.id, user.id, 'draft', body.integrationId);
    if (body.action !== 'draft')
      await this.access.require(
        org.id,
        user.id,
        body.action === 'now' ? 'publish' : 'schedule',
        body.integrationId
      );
    const integration = await this.db.integration.findFirst({
      where: {
        id: body.integrationId,
        organizationId: org.id,
        deletedAt: null,
        providerIdentifier: { in: STUDIO_PROVIDERS },
      },
    });
    if (!integration || integration.disabled || integration.refreshNeeded)
      throw new BadRequestException(
        'Akun belum siap; hubungi pemilik untuk menghubungkan ulang.'
      );
    const media = await this.db.media.findMany({
      where: {
        id: { in: body.mediaIds },
        organizationId: org.id,
        studioOwnerId: user.id,
        deletedAt: null,
      },
    });
    if (media.length !== body.mediaIds.length)
      throw new ForbiddenException('Media bukan milik Anda.');
    if (integration.providerIdentifier.startsWith('instagram')) {
      const video = (path: string) => /\.(mp4|mov)(?:\?|$)/i.test(path);
      if (
        body.postType === 'photo' &&
        (media.length !== 1 || video(media[0].path))
      )
        throw new BadRequestException(
          'Foto feed memerlukan tepat satu gambar.'
        );
      if (
        body.postType === 'carousel' &&
        (media.length < 2 || media.length > 10)
      )
        throw new BadRequestException(
          'Carousel memerlukan 2–10 foto atau video.'
        );
      if (
        body.postType === 'reel' &&
        (media.length !== 1 || !video(media[0].path))
      )
        throw new BadRequestException(
          'Reel memerlukan tepat satu video MP4 atau MOV.'
        );
      if (body.postType === 'story' && media.length !== 1)
        throw new BadRequestException(
          'Story memerlukan tepat satu foto atau video.'
        );
      if (body.content.length > 2200)
        throw new BadRequestException(
          'Caption Instagram maksimal 2.200 karakter.'
        );
    }
    const old = body.postId
      ? await this.db.post.findFirst({
          where: {
            id: body.postId,
            organizationId: org.id,
            integrationId: integration.id,
            deletedAt: null,
            parentPostId: null,
          },
        })
      : null;
    if (body.postId && (!old || old.state !== 'DRAFT'))
      throw new BadRequestException('Hanya draf yang dapat diedit di studio.');
    if (
      old &&
      (await this.db.post.count({
        where: { organizationId: org.id, group: old.group, deletedAt: null },
      })) !== 1
    ) {
      throw new BadRequestException(
        'Draf berisi beberapa postingan; minta superowner menggunakan editor lanjutan.'
      );
    }
    const date =
      body.action === 'schedule' ? new Date(body.date || '') : new Date();
    if (
      !Number.isFinite(date.getTime()) ||
      (body.action === 'schedule' && date.getTime() < Date.now() + 60000)
    )
      throw new BadRequestException('Jadwalkan minimal satu menit ke depan.');
    const raw: any = {
      type: body.action,
      date: date.toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: integration.id },
          ...(old ? { group: old.group } : {}),
          value: [
            {
              ...(old ? { id: old.id } : {}),
              content: body.content,
              image: body.mediaIds.map((id) => {
                const m = media.find((item) => item.id === id)!;
                return { id: m.id, path: m.path };
              }),
            },
          ],
          settings: {
            __type: integration.providerIdentifier,
            post_type: body.postType === 'story' ? 'story' : 'post',
            title: body.content.slice(0, 90),
            privacy_level: 'SELF_ONLY',
            duet: false,
            stitch: false,
            comment: true,
            autoAddMusic: 'no',
            brand_content_toggle: false,
            brand_organic_toggle: false,
            content_posting_method: 'DIRECT_POST',
          },
        },
      ],
    };
    const validation = await this.posts.validatePosts(org.id, raw.posts);
    for (const item of validation) {
      if (
        item.emptyContent ||
        (body.action !== 'draft' &&
          (!item.valid || item.errors !== true || item.tooLong))
      ) {
        throw new BadRequestException(
          item.settingsError ||
            (typeof item.errors === 'string'
              ? item.errors
              : 'Periksa caption dan media untuk akun ini.')
        );
      }
    }
    const mapped = await this.posts.mapTypeToPost(raw, org.id);
    return this.posts.createPost(org.id, mapped, 'WEB', false, {
      userId: user.id,
      action: body.action,
    });
  }

  @Delete('/posts/:id')
  async deletePost(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    const post = await this.db.post.findFirst({
      where: {
        id,
        organizationId: org.id,
        deletedAt: null,
        parentPostId: null,
      },
    });
    if (!post) throw new ForbiddenException();
    await this.access.require(org.id, user.id, 'delete', post.integrationId);
    const siblings = await this.db.post.findMany({
      where: { organizationId: org.id, group: post.group, deletedAt: null },
    });
    for (const sibling of siblings) {
      await this.access.require(
        org.id,
        user.id,
        'delete',
        sibling.integrationId
      );
      if (!['DRAFT', 'QUEUE', 'ERROR'].includes(sibling.state))
        throw new BadRequestException(
          'Konten terbit tidak dapat dihapus melalui studio.'
        );
    }
    await this.posts.deletePost(org.id, post.group);
    return { ok: true };
  }
}
