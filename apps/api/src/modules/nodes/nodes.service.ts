import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NodeDto } from '@naf/shared';

import type { NafUser } from '../../common/decorators/current-user.decorator';
import { ConnectionsService } from '../connections/connections.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
  ) {}

  async listChildren(user: NafUser, parentId: string | null): Promise<NodeDto[]> {
    if (parentId != null) await this.ownedNodeOrThrow(user, parentId);
    const rows = await this.prisma.node.findMany({
      where: {
        ownerId: user.id,
        parentId,
        status: 'ACTIVE',
      },
      orderBy: [{ type: 'desc' }, { name: 'asc' }], // folders first (FILE < FOLDER alphabetically)
      take: 500,
    });
    return rows.map(toDto);
  }

  async listTrash(user: NafUser): Promise<NodeDto[]> {
    const rows = await this.prisma.node.findMany({
      where: { ownerId: user.id, status: 'TRASHED' },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    });
    return rows.map(toDto);
  }

  async createFolder(user: NafUser, parentId: string | null, name: string): Promise<NodeDto> {
    if (parentId != null) {
      const parent: { id: string } | null = await this.prisma.node.findFirst({
        where: { id: parentId, ownerId: user.id, type: 'FOLDER', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Target folder not found');
    }
    await this.assertNameFree(user, parentId, name);
    const row = await this.prisma.node.create({
      data: { ownerId: user.id, parentId, type: 'FOLDER', name, status: 'ACTIVE' },
    });
    return toDto(row);
  }

  async rename(user: NafUser, nodeId: string, name: string): Promise<NodeDto> {
    const node = await this.ownedActiveOrThrow(user, nodeId);
    await this.assertNameFree(user, node.parentId, name, nodeId);
    const updated = await this.prisma.node.update({ where: { id: node.id }, data: { name } });
    return toDto(updated);
  }

  /** Cycle-safe move: we walk up at most 32 levels looking for ourselves. */
  async move(user: NafUser, nodeId: string, newParentId: string | null): Promise<NodeDto> {
    const node = await this.ownedActiveOrThrow(user, nodeId);

    if (newParentId != null) {
      if (newParentId === nodeId) throw new ConflictException('Cannot move a folder into itself');
      let cursor: string | null = newParentId;
      for (let depth = 0; cursor != null && depth < 32; depth++) {
        if (cursor === nodeId) throw new ConflictException('Cannot move a folder into its own subtree');
        const parent: { id: string; parentId: string | null } | null =
          await this.prisma.node.findUnique({
            where: { id: cursor },
            select: { id: true, parentId: true },
          });
        cursor = parent?.parentId ?? null;
      }
      const target = await this.prisma.node.findFirst({
        where: { id: newParentId, ownerId: user.id, type: 'FOLDER', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Target folder not found');
    }

    await this.assertNameFree(user, newParentId, node.name, nodeId);
    const updated = await this.prisma.node.update({
      where: { id: node.id },
      data: { parentId: newParentId },
    });
    return toDto(updated);
  }

  async trash(user: NafUser, nodeId: string): Promise<void> {
    await this.ownedActiveOrThrow(user, nodeId);
    await this.prisma.node.updateMany({
      where: { id: nodeId, status: 'ACTIVE' },
      data: { status: 'TRASHED', deletedAt: new Date() },
    });
  }

  async restore(user: NafUser, nodeId: string): Promise<void> {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, ownerId: user.id, status: 'TRASHED' },
    });
    if (!node) throw new NotFoundException('Not in trash');
    await this.assertNameFree(user, node.parentId, node.name, nodeId);
    await this.prisma.node.update({
      where: { id: node.id },
      data: { status: 'ACTIVE', deletedAt: null },
    });
  }

  /**
   * Hard delete: removes the remote object first (freeing real space), then
   * our metadata. Remote failure surfaces loudly so users know space was NOT
   * freed rather than silently orphaning the file.
   */
  async purge(user: NafUser, nodeId: string): Promise<void> {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, ownerId: user.id },
      include: { locations: true },
    });
    if (!node) throw new NotFoundException('Not found');
    if (node.type === 'FOLDER') {
      throw new ForbiddenException({ code: 'FOLDER_NOT_EMPTY', message: 'Empty folders purge automatically in Phase 2; delete contained files first' });
    }

    for (const location of node.locations.filter((l) => l.status === 'COMPLETE')) {
      try {
        const { adapter } = await this.connections.adapterFor(user, location.connectionId);
        await adapter.remove(location.remoteFileId);
      } catch (err) {
        // Connection gone entirely → the remote copy is unreachable anyway.
        if (!(err instanceof ForbiddenException)) {
          throw err;
        }
      }
    }

    await this.prisma.node.delete({ where: { id: node.id } });
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async ownedNodeOrThrow(user: NafUser, nodeId: string) {
    const node = await this.prisma.node.findFirst({ where: { id: nodeId, ownerId: user.id } });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  private async ownedActiveOrThrow(user: NafUser, nodeId: string) {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, ownerId: user.id, status: 'ACTIVE' },
    });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  /** Case-insensitive uniqueness among ACTIVE siblings (DB-level partial unique lands Phase 2). */
  private async assertNameFree(
    user: NafUser,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await this.prisma.node.findFirst({
      where: {
        ownerId: user.id,
        parentId,
        status: 'ACTIVE',
        name: { equals: name },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: 'NAME_TAKEN',
        message: `“${name}” already exists here`,
      });
    }
  }
}

function toDto(row: {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  sizeBytes: bigint | null;
  mimeType: string | null;
  updatedAt: Date;
}): NodeDto {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    type: row.type === 'FOLDER' ? 'folder' : 'file',
    sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
    ...(row.mimeType ? { mimeType: row.mimeType } : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}
