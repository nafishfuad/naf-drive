import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SupabaseJwtGuard } from './common/guards/supabase-jwt.guard';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { VaultModule } from './modules/vault/vault.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', '*.token'],
          censor: '[REDACTED]',
        },
      },
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    VaultModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SupabaseJwtGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
