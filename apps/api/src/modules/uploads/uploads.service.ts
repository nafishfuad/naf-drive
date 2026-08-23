import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DownloadTicketResponse,
  ProviderId,
  UploadCompleteRequest,
  UploadInitRequest,
  UploadInitResponse,
  UploadStatusResponse,
} from '@naf/shared';

import type { NafUser } from '../../common/decorators/current-user.decorator';
import { ConnectionsService } from '../connections/connections.service';
import { PlacementService } from '../placement/placement.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly placement: PlacementService,
    private readonly connections: ConnectionsService,
  ) {}

  async init(user: NafUser, dto: UploadInitRequest): Promise<UploadInitResponse> {
    const reserved = await this.placement.reserve(user, dto);
    const { accessToken, expiresAtEpochSec } = await this.connections.freshAccessToken(
      user,
      reserved.connectionId,
    );
    const row = await this.prisma.providerConnection.findUniqueOrThrow({
      where: { id: reserved.connectionId },
      select: { providerType: true },
    });
    const providerId = row.providerType === 'DROPBOX' ? 'dropbox' : 'google-drive';

    return {
      providerId,
      sessionId: reserved.sessionId,
      nodeId: reserved.nodeId,
      chunkSizeBytes: reserved.chunkSizeBytes,
      remoteRootFolder: reserved.remoteRootFolder,
      accessToken,
      tokenExpiresAt: new Date(expiresAtEpochSec * 1000).toISOString(),
    };
  }

  /** Resume support: snapshot of what the provider already has + a fresh token. */
  async status(user: NafUser, sessionId: string): Promise<UploadStatusResponse> {
    const session = await this.ownedSession(user, sessionId);
    const node = await this.prisma.node.findUniqueOrThrow({ where: { id: session.nodeId } });

    const isActive = session.status === 'ACTIVE' && session.expiresAt > new Date();
    let accessToken: string | null = null;
    let tokenExpiresAt: string | null = null;
    if (isActive) {
      const fresh = await this.connections.freshAccessToken(user, session.connectionId);
      accessToken = fresh.accessToken;
      tokenExpiresAt = new Date(fresh.expiresAtEpochSec * 1000).toISOString();
    }

    return {
      status: isActive ? 'ACTIVE' : (session.status as UploadStatusResponse['status']),
      providerId: session.connection.providerType === 'DROPBOX' ? 'dropbox' : 'google-drive',
      totalBytes: Number(session.totalBytes),
      chunkSizeBytes: session.chunkSizeBytes,
      receivedChunks: toChunkList(session.receivedChunks),
      name: node.name,
      remoteRootFolder: session.targetRemoteFolder,
      accessToken,
      tokenExpiresAt,
    };
  }

  /**
   * Client finished pushing chunks straight to the provider. We verify chunk
   * coverage, flip the staged node active, record the location and bump
   * quota/usage counters — all atomically.
   */
  async complete(user: NafUser, sessionId: string, dto: UploadCompleteRequest): Promise<{ nodeId: string }> {
    const session = await this.ownedSession(user, sessionId);
    if (session.status !== 'ACTIVE') throw new ConflictException('Upload already finalized');

    const expectedChunks = Math.ceil(Number(session.totalBytes) / session.chunkSizeBytes) || 1;
    const received = [...new Set(dto.receivedChunks)].sort((a, b) => a - b);
    const coverageOk =
      received.length === expectedChunks &&
      received[received.length - 1] === expectedChunks - 1 &&
      received.every((n, i) => n === i);
    if (!coverageOk) {
      throw new ConflictException({
        code: 'INCOMPLETE_TRANSFER',
        message: `Expected ${expectedChunks} chunks; client reported ${received.length}`,
        details: { expectedChunks, received: received.length },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.uploadSession.updateMany({
        where: { id: session.id, status: 'ACTIVE' },
        data: { status: 'COMPLETED', receivedChunks: received },
      });
      if (updated.count !== 1) throw new ConflictException('Upload already finalized');

      await tx.node.update({
        where: { id: session.nodeId },
        data: { status: 'ACTIVE', sizeBytes: BigInt(dto.finalSizeBytes) },
      });

      await tx.fileLocation.create({
        data: {
          nodeId: session.nodeId,
          connectionId: session.connectionId,
          remoteFileId: dto.remoteFileId,
          sizeBytes: BigInt(dto.finalSizeBytes),
          status: 'COMPLETE',
        },
      });

      await tx.providerConnection.update({
        where: { id: session.connectionId },
        data: { quotaUsedBytes: { increment: BigInt(dto.finalSizeBytes) } },
      });

      await bumpUsage(tx, user.id, { uploadBytes: dto.finalSizeBytes });
    });

    return { nodeId: session.nodeId };
  }

  async cancel(user: NafUser, sessionId: string): Promise<void> {
    const session = await this.ownedSession(user, sessionId);
    if (session.status !== 'ACTIVE') return;
    // Node stays STAGED until the reaper purges it with its cancelled session.
    await this.placement.release(session.id);
  }

  async downloadTicket(user: NafUser, nodeId: string): Promise<DownloadTicketResponse> {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, ownerId: user.id, status: 'ACTIVE', type: 'FILE' },
    });
    if (!node) throw new NotFoundException('File not found');

    const locations = await this.prisma.fileLocation.findMany({
      where: { nodeId, status: 'COMPLETE' },
      include: { connection: { select: { providerType: true, status: true } } },
    });
    const usable = locations.filter((l) => l.connection.status === 'OK');
    if (usable.length === 0) {
      throw new NotFoundException({ code: 'NO_LOCATION', message: 'No healthy copy available' });
    }

    const primary = usable[0]!;
    const providerId: ProviderId =
      primary.connection.providerType === 'DROPBOX' ? 'dropbox' : 'google-drive';
    const { accessToken, expiresAtEpochSec } = await this.connections.freshAccessToken(
      user,
      primary.connectionId,
    );

    await this.bumpDownloadUsage(nodeId);

    return {
      node: {
        id: node.id,
        name: node.name,
        mimeType: node.mimeType ?? undefined,
        sizeBytes: safeNumber(node.sizeBytes),
      },
      locations: usable.map((l) => ({
        connectionId: l.connectionId,
        remoteFileId: l.remoteFileId,
        sizeBytes: safeNumber(l.sizeBytes),
      })),
      providerId,
      accessToken,
      tokenExpiresAt: new Date(expiresAtEpochSec * 1000).toISOString(),
    };
  }

  private async ownedSession(user: NafUser, sessionId: string) {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id: sessionId, userId: user.id },
      include: { connection: { select: { providerType: true } } },
    });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.expiresAt <= new Date() && session.status === 'ACTIVE') {
      throw new ForbiddenException({ code: 'SESSION_EXPIRED', message: 'Start the upload again' });
    }
    return session;
  }

  private async bumpDownloadUsage(nodeId: string) {
    const node = await this.prisma.node.findUniqueOrThrow({
      where: { id: nodeId },
      select: { ownerId: true, sizeBytes: true },
    });
    await this.prisma.usageDaily.upsert({
      where: { userId_date: { userId: node.ownerId, date: todayUtc() } },
      update: { downloadBytes: { increment: node.sizeBytes ?? 0n } },
      create: {
        userId: node.ownerId,
        date: todayUtc(),
        downloadBytes: node.sizeBytes ?? 0n,
      },
    }).catch(() => undefined);
  }
}

type Tx = Prisma.TransactionClient;

async function bumpUsage(
  tx: Tx,
  userId: string,
  delta: { uploadBytes?: number; apiRequests?: number },
): Promise<void> {
  await tx.usageDaily.upsert({
    where: { userId_date: { userId, date: todayUtc() } },
    update: {
      ...(delta.uploadBytes ? { uploadBytes: { increment: BigInt(delta.uploadBytes) } } : {}),
      ...(delta.apiRequests ? { apiRequests: { increment: delta.apiRequests } } : {}),
    },
    create: {
      userId,
      date: todayUtc(),
      uploadBytes: BigInt(delta.uploadBytes ?? 0),
      apiRequests: delta.apiRequests ?? 0,
    },
  });
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toChunkList(value: Prisma.JsonValue): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
}

function safeNumber(value: bigint | null): number | null {
  return value == null ? null : Number(value);
}
