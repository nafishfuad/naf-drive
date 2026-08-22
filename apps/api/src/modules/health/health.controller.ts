import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_CONFIG } from '../../config/config.module';
import { Inject } from '@nestjs/common';
import type { AppConfig } from '../../config/env.schema';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  async check(): Promise<{
    status: string;
    env: string;
    version: string;
    uptimeSec: number;
    db: boolean;
  }> {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }

    return {
      status: 'ok',
      env: this.config.env,
      version: '0.1.0',
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      db,
    };
  }
}
