import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  vaultInitRequestSchema,
  type VaultInitRequest,
  type VaultStatusResponse,
} from '@naf/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { NafUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VaultService } from './vault.service';

/**
 * Routes: POST /v1/vault/init · GET /v1/vault/status (see @naf/shared API_PATHS).
 * Global prefix "v1" is applied in main.ts.
 */
@Controller('vault')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Post('init')
  async init(
    @CurrentUser() user: NafUser,
    @Body(new ZodValidationPipe(vaultInitRequestSchema)) dto: VaultInitRequest,
  ): Promise<VaultStatusResponse> {
    await this.vault.initialize(user, dto);
    return { storageMode: 'VAULT', vaultInitialized: true };
  }

  @Get('status')
  async status(@CurrentUser() user: NafUser): Promise<VaultStatusResponse> {
    const record = await this.vault.statusOf(user);
    return {
      storageMode: record?.storageMode ?? 'STANDARD',
      vaultInitialized: Boolean(record?.vaultInitializedAt),
    };
  }
}
