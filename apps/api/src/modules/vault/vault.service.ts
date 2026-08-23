import { Injectable } from '@nestjs/common';
import type { VaultInitRequest } from '@naf/shared';

import type { NafUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  // Plain ArrayBuffer-backed view (Prisma Bytes expects Uint8Array<ArrayBuffer>).
  const decoded = Buffer.from(value, 'base64');
  const bytes = new Uint8Array(decoded.length);
  bytes.set(decoded);
  return bytes;
}

/**
 * Stores client-wrapped master key material only.
 * Plaintext keys NEVER reach this service — see AGENTS.md hard rules #1/#4.
 */
@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enables Private Vault (idempotent): stores wrapped key material and flips
   * the account into VAULT mode.
   */
  async initialize(
    user: NafUser,
    dto: VaultInitRequest,
  ): Promise<void> {
    const data = {
      wrappedWithPassphrase: base64ToBytes(dto.wrappedWithPassphrase),
      wrappedWithPhrase: base64ToBytes(dto.wrappedWithPhrase),
      phraseCheckSha256: dto.phraseCheckSha256,
      vaultInitializedAt: new Date(),
    };

    await this.prisma.user.upsert({
      where: { supabaseUserId: user.id },
      update: { ...data, storageMode: 'VAULT' },
      create: {
        id: user.id,
        supabaseUserId: user.id,
        email: user.email ?? null,
        storageMode: 'VAULT',
        role: 'USER',
        ...data,
      },
    });
  }

  statusOf(user: NafUser) {
    return this.prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { storageMode: true, vaultInitializedAt: true },
    });
  }
}
