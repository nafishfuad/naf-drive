import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { capPctSchema } from '@naf/shared';
import { z } from 'zod';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { NafUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/env.schema';
import { ConnectionsService } from './connections.service';

const providerParamSchema = z.enum(['google-drive', 'dropbox']);

@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  list(@CurrentUser() user: NafUser) {
    return this.connections.listForUser(user);
  }

  /** Returns { authUrl }; the browser navigates to it (top-level, not XHR). */
  @Get(':providerId/auth-url')
  async authUrl(@CurrentUser() user: NafUser, @Param('providerId') providerId: string) {
    const parsed = providerParamSchema.safeParse(providerId);
    if (!parsed.success) throw new BadRequestException('Unknown provider');
    return { authUrl: await this.connections.buildAuthUrl(user, parsed.data) };
  }

  /**
   * Provider bounces the user here. Identity comes from the signed state —
   * this route is intentionally Public. Ends with a top-level redirect back
   * to the web app.
   */
  @Public()
  @Get('callback/:providerId')
  async callback(
    @Res() res: Response,
    @Param('providerId') providerId: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
  ) {
    const web = this.config.webAppUrl;
    const parsed = providerParamSchema.safeParse(providerId);
    if (!parsed.success) return res.redirect(`${web}/settings?connected=unknown_provider`);

    if (oauthError) {
      return res.redirect(`${web}/settings?error=${encodeURIComponent(oauthError)}`);
    }
    const result = await this.connections.handleCallback(parsed.data, code, state);
    if (!result.ok) {
      return res.redirect(`${web}/settings?error=${encodeURIComponent(result.errorCode ?? 'failed')}`);
    }
    return res.redirect(`${web}/settings?connected=${parsed.data}`);
  }

  @Patch(':id')
  updateCap(
    @CurrentUser() user: NafUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ capPct: capPctSchema }).strict()))
    dto: { capPct: number },
  ) {
    return this.connections.setCap(user, id, dto.capPct);
  }

  @Delete(':id')
  remove(@CurrentUser() user: NafUser, @Param('id') id: string) {
    return this.connections.disconnect(user, id);
  }
}
