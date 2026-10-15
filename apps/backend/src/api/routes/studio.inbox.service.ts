import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { StudioAccessService } from '@gitroom/nestjs-libraries/database/prisma/studio-access.service';
import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';

type Thread = {
  orgId: string;
  userId: string;
  accountId: string;
  conversationId: string;
  recipient: string;
};
@Injectable()
export class StudioInboxService {
  constructor(private db: PrismaService, private access: StudioAccessService) {}
  private async account(
    orgId: string,
    userId: string,
    id: string,
    reply = false
  ) {
    await this.access.require(orgId, userId, 'messages', id);
    if (reply) await this.access.require(orgId, userId, 'reply', id);
    const account = await this.db.integration.findFirst({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
        disabled: false,
        refreshNeeded: false,
        providerIdentifier: 'instagram-standalone',
      },
    });
    if (!account)
      throw new BadRequestException(
        'Inbox memerlukan akun Instagram Standalone yang terhubung dan aktif.'
      );
    return account;
  }
  private async graph(token: string, path: string, body?: unknown) {
    let result: any;
    try {
      const response = await fetch(
        `https://graph.instagram.com/${META_GRAPH_API_VERSION}/${path}`,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        }
      );
      result = await response.json();
      if (!response.ok || result.error) {
        throw new Error('Provider rejected request');
      }
    } catch {
      throw new BadRequestException(
        'Instagram menolak permintaan pesan. Periksa izin instagram_business_manage_messages, akses pesan pada akun Instagram, lalu hubungkan ulang akun. Balasan juga harus memenuhi jendela pesan Meta.'
      );
    }
    return result;
  }
  private thread(
    handle: string,
    orgId: string,
    userId: string,
    accountId: string
  ): Thread {
    try {
      const data = verify(handle, process.env.JWT_SECRET!, {
        algorithms: ['HS256'],
        audience: 'lrm-inbox',
        issuer: 'lrm-studio',
      }) as Thread;
      if (
        data.orgId !== orgId ||
        data.userId !== userId ||
        data.accountId !== accountId ||
        typeof data.conversationId !== 'string' ||
        typeof data.recipient !== 'string'
      )
        throw new Error();
      return data;
    } catch {
      throw new ForbiddenException(
        'Percakapan tidak valid atau kedaluwarsa. Muat ulang inbox.'
      );
    }
  }
  async conversations(
    orgId: string,
    userId: string,
    accountId: string,
    after?: string
  ) {
    const account = await this.account(orgId, userId, accountId);
    const data = await this.graph(
      account.token,
      `${encodeURIComponent(
        account.internalId
      )}/conversations?platform=instagram&fields=id,updated_time,participants&limit=25${
        after ? '&after=' + encodeURIComponent(after) : ''
      }`
    );
    if (!Array.isArray(data.data))
      throw new BadRequestException(
        'Instagram tidak mengembalikan daftar percakapan yang dapat dibaca.'
      );
    return {
      threads: (Array.isArray(data.data) ? data.data : []).map((item: any) => {
        const participants = Array.isArray(item.participants?.data)
          ? item.participants.data
          : [];
        const other = participants.find(
          (p: any) => String(p.id) !== String(account.internalId)
        );
        return {
          id: String(item.id),
          name: other?.username || other?.name || 'Pengguna Instagram',
          updatedAt: item.updated_time,
          handle: sign(
            {
              orgId,
              userId,
              accountId,
              conversationId: String(item.id),
              recipient: String(other?.id || ''),
            },
            process.env.JWT_SECRET!,
            {
              algorithm: 'HS256',
              expiresIn: '15m',
              audience: 'lrm-inbox',
              issuer: 'lrm-studio',
            }
          ),
        };
      }),
      after: data.paging?.next ? data.paging?.cursors?.after || null : null,
    };
  }
  async messages(
    orgId: string,
    userId: string,
    accountId: string,
    handle: string,
    after?: string
  ) {
    const account = await this.account(orgId, userId, accountId);
    const thread = this.thread(handle, orgId, userId, accountId);
    const data = await this.graph(
      account.token,
      `${encodeURIComponent(
        thread.conversationId
      )}/messages?fields=id,message,from,created_time&limit=50${
        after ? '&after=' + encodeURIComponent(after) : ''
      }`
    );
    if (!Array.isArray(data.data))
      throw new BadRequestException(
        'Instagram tidak mengembalikan daftar pesan yang dapat dibaca.'
      );
    const messages = (Array.isArray(data.data) ? data.data : []).map(
      (item: any) => ({
        id: String(item.id),
        text: String(item.message || ''),
        incoming: String(item.from?.id) === thread.recipient,
        createdAt: item.created_time,
      })
    );
    const incomingTimes = messages
      .filter((m: any) => m.incoming)
      .map((m: any) => Date.parse(m.createdAt))
      .filter(Number.isFinite);
    const lastIncoming = incomingTimes.length ? Math.max(...incomingTimes) : 0;
    return {
      messages,
      canReply:
        !!thread.recipient && lastIncoming > Date.now() - 24 * 60 * 60 * 1000,
      after: data.paging?.next ? data.paging?.cursors?.after || null : null,
    };
  }
  async reply(
    orgId: string,
    userId: string,
    accountId: string,
    handle: string,
    text: string
  ) {
    if (!text.trim())
      throw new BadRequestException('Isi balasan tidak boleh kosong.');
    const account = await this.account(orgId, userId, accountId, true);
    const thread = this.thread(handle, orgId, userId, accountId);
    const status = await this.messages(orgId, userId, accountId, handle);
    if (!status.canReply)
      throw new BadRequestException(
        'Balasan hanya tersedia setelah pesan masuk dalam 24 jam terakhir.'
      );
    const current = await this.account(orgId, userId, accountId, true);
    await this.graph(
      current.token,
      `${encodeURIComponent(current.internalId)}/messages`,
      { recipient: { id: thread.recipient }, message: { text } }
    );
    return { ok: true };
  }
}
