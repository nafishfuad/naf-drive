import { ConflictException, Injectable } from '@nestjs/common';

import type { NafUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { pickTarget } from './domain/placement';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReserveUploadInput {
  name: string;
  parentId: string | null;
  sizeBytes: number;
  mimeType?: string;
}

export interface ReservedUpload {
  nodeId: string;
  sessionId: string;
  connectionId: string;
  remoteRootFolder: string | null;
  chunkSizeBytes: number;
}

@Injectable()
export class PlacementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically picks a connection and reserves space for one upload.
   * Rows are locked FOR UPDATE so concurrent uploads can never double-spend
   * the same free bytes; reservation accounting lives inside this transaction
   * (sessions expire, automatically freeing their reservation).
   */
  async reserve(user: NafUser, input: ReserveUploadInput): Promise<ReservedUpload> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          quota_total_bytes: bigint | null;
          quota_used_bytes: bigint | null;
          cap_pct: number;
          remote_root_folder: string | null;
        }>
      >`
        SELECT id, quota_total_bytes, quota_used_bytes, cap_pct, remote_root_folder
        FROM provider_connections
        WHERE user_id = ${user.id} AND status = 'OK'
        FOR UPDATE`;

      if (input.parentId != null) {
        const parent = await tx.node.findFirst({
          where: { id: input.parentId, ownerId: user.id, type: 'FOLDER', status: 'ACTIVE' },
          select: { id: true },
        });
        if (!parent) throw new ConflictException({ code: 'PARENT_NOT_FOUND', message: 'Target folder not found' });
      }

      const reserved = await tx.uploadSession.groupBy({
        by: ['connectionId'],
        _sum: { totalBytes: true },
        where: {
          userId: user.id,
          status: { in: ['ACTIVE', 'COMPLETING'] },
          expiresAt: { gt: new Date() },
        },
      });
      const reservedByConnection = new Map(
        reserved.map((r) => [r.connectionId, Number(r._sum.totalBytes ?? 0n)]),
      );

      const decision = pickTarget(
        rows.map((c) => ({
          connectionId: c.id,
          totalBytes: c.quota_total_bytes == null ? null : Number(c.quota_total_bytes),
          usedBytes: Number(c.quota_used_bytes ?? 0n),
          reservedBytes: reservedByConnection.get(c.id) ?? 0,
          capPct: c.cap_pct,
        })),
        input.sizeBytes,
      );

      if (!decision.ok) {
        throw new ConflictException(
          decision.reason === 'NO_CANDIDATES'
            ? { code: 'NO_CONNECTIONS', message: 'Connect a cloud account first' }
            : {
                code: 'NO_SPACE',
                message:
                  'No connected account has enough free space (within your caps) for this file',
              },
        );
      }

      const chosen = rows.find((c) => c.id === decision.connectionId)!;

      const node = await tx.node.create({
        data: {
          ownerId: user.id,
          parentId: input.parentId,
          type: 'FILE',
          name: input.name,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          status: 'STAGED',
        },
      });

      const session = await tx.uploadSession.create({
        data: {
          userId: user.id,
          nodeId: node.id,
          connectionId: chosen.id,
          targetRemoteFolder: chosen.remote_root_folder,
          totalBytes: BigInt(input.sizeBytes),
          chunkSizeBytes: 8 * 1024 * 1024,
          receivedChunks: [],
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });

      return {
        nodeId: node.id,
        sessionId: session.id,
        connectionId: chosen.id,
        remoteRootFolder: chosen.remote_root_folder,
        chunkSizeBytes: session.chunkSizeBytes,
      };
    });
  }

  /** Frees a reservation without side effects (abandoned sessions). */
  async release(sessionId: string): Promise<void> {
    await this.prisma.uploadSession.updateMany({
      where: { id: sessionId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
  }
}
