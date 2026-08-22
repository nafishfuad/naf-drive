import { Injectable, Logger } from '@nestjs/common';

import type { NafUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent: creates the local row the first time an authenticated user appears. */
  async ensureUser(user: NafUser) {
    return this.prisma.user.upsert({
      where: { supabaseUserId: user.id },
      update: {},
      create: {
        supabaseUserId: user.id,
        email: user.email ?? null,
        storageMode: 'STANDARD',
        role: 'USER',
      },
    });
  }
}
