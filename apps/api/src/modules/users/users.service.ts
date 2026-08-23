import { Injectable, Logger } from '@nestjs/common';

import type { NafUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent provisioning. The local PK mirrors the auth UID so every
   * domain FK (owner_id / user_id) can use the value carried in the JWT.
   *
   * Legacy rows created before the PK-alignment change hold a random id —
   * they own nothing by construction (FKs used to fail), so we safely
   * recreate them under the aligned key.
   */
  async ensureUser(user: NafUser) {
    const existing = await this.prisma.user.findUnique({
      where: { supabaseUserId: user.id },
    });

    if (!existing) {
      return this.prisma.user.create({
        data: {
          id: user.id,
          supabaseUserId: user.id,
          email: user.email ?? null,
          storageMode: 'STANDARD',
          role: 'USER',
        },
      });
    }

    if (existing.id !== user.id) {
      this.logger.warn(`Realigning legacy user row ${existing.id} → ${user.id}`);
      await this.prisma.user.delete({ where: { id: existing.id } });
      return this.prisma.user.create({
        data: {
          id: user.id,
          supabaseUserId: user.id,
          email: existing.email ?? (user.email ?? null),
          displayName: existing.displayName,
          storageMode: existing.storageMode,
          role: existing.role,
        },
      });
    }

    return existing;
  }
}
