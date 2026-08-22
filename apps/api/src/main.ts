import 'dotenv/config';
import { NestFactory } from '@nestjs/core';

import type { AppConfig } from './config/env.schema';
import { APP_CONFIG } from './config/config.module';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get<AppConfig>(APP_CONFIG);

  app.enableCors({
    origin: config.corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // /health stays unprefixed; all other routes live under /v1 (see @naf/shared).
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableShutdownHooks();

  await app.listen(config.port);
}

void bootstrap();
