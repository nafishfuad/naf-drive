import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import type { ConnectionDto, ProviderId } from '@naf/shared';
import type { OAuthTokenSet } from '@naf/providers';

import { openJson, sealJson } from '../../common/crypto/envelope';
import type { NafUser } from '../../common/decorators/current-user.decorator';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/env.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { classifyOAuthError } from './oauth-error-classifier';
import {
  PROVIDER_BINDINGS,
  SUPPORTED_PROVIDER_IDS,
  ensureRootFolder,
  fromDbEnum,
  toDbEnum,
} from './provider-registry';

const TOKEN_REFRESH_MARGIN_SEC = 120;

interface ConnectionStateClaims {
  uid: string;
  provider: string;
}

type ProviderConnectionRow = NonNullable<
  Awaited<ReturnType<PrismaService['providerConnection']['findFirst']>>
>;

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listForUser(user: NafUser): Promise<ConnectionDto[]> {
    const rows = await this.prisma.providerConnection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async buildAuthUrl(user: NafUser, providerId: ProviderId): Promise<string> {
    const binding = this.bindingFor(providerId);
    if (!binding.isConfigured(this.config)) {
      throw new ServiceUnavailableException(
        `PROVIDER_NOT_CONFIGURED: server-side credentials for ${providerId} are missing`,
      );
    }
    const state = await new SignJWT({ uid: user.id, provider: providerId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(this.stateSecret());

    return binding.authUrl(this.oauthConfigFor(providerId), state);
  }

  /** Public callback — identity comes from the signed state, never a session. */
  async handleCallback(
    providerId: ProviderId,
    code: string | undefined,
    state: string | undefined,
  ): Promise<{ uid: string; ok: boolean; errorCode?: string; reason?: string }> {
    if (!code || !state) return { uid: '', ok: false, errorCode: 'missing_params' };

    let claims: ConnectionStateClaims;
    try {
      const verified = await jwtVerify(state, this.stateSecret());
      claims = verified.payload as unknown as ConnectionStateClaims;
    } catch {
      return { uid: '', ok: false, errorCode: 'bad_state' };
    }
    if (
      claims.provider !== providerId ||
      !(SUPPORTED_PROVIDER_IDS as readonly string[]).includes(providerId)
    ) {
      return { uid: claims.uid ?? '', ok: false, errorCode: 'provider_mismatch' };
    }

    try {
      const tokens = await this.exchangeAndStore(claims.uid, providerId, code);
      if (!tokens.refreshToken) throw new Error('provider returned no refresh_token');
      return { uid: claims.uid, ok: true };
    } catch (err) {
      const { code: reasonCode, detail } = classifyOAuthError(err);
      // Full stack + detail stays server-side; only the short reason reaches the UI.
      this.logger.error(
        `OAuth callback failed (${providerId}) stage=${reasonCode} detail=${detail ?? 'n/a'}`,
        err instanceof Error ? err.stack : String(err),
      );
      // Dev convenience: always show the raw detail outside production.
      const debugDetail =
        process.env['OAUTH_DEBUG'] === 'true' || this.config.env !== 'production'
          ? detail?.slice(0, 300)
          : undefined;
      return {
        uid: claims.uid,
        ok: false,
        errorCode: 'exchange_failed',
        reason: debugDetail ?? reasonCode,
      };
    }
  }

  async setCap(user: NafUser, connectionId: string, capPct: number): Promise<ConnectionDto> {
    const row = await this.ownedRowOrThrow(user, connectionId);
    const updated = await this.prisma.providerConnection.update({
      where: { id: row.id },
      data: { capPct },
    });
    return this.toDto(updated);
  }

  /** Revokes at the provider best-effort, then always removes our row. */
  async disconnect(user: NafUser, connectionId: string): Promise<void> {
    const row = await this.ownedRowOrThrow(user, connectionId);
    const providerId = fromDbEnum(row.providerType);

    if (row.status !== 'EXPIRED' && providerId && this.bindingFor(providerId).isConfigured(this.config)) {
      try {
        const tokens = this.openTokens(row.encryptedTokensJson);
        if (providerId === 'google-drive') {
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: tokens.accessToken }),
          });
        } else {
          await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
        }
      } catch (err) {
        this.logger.warn(`Revoke at provider failed (continuing): ${String(err)}`);
      }
    }

    await this.prisma.providerConnection.delete({ where: { id: row.id } });
  }

  /**
   * Token broker — every direct browser↔provider transfer and server-side
   * adapter call gets its short-lived credential through here.
   */
  async freshAccessToken(
    user: NafUser,
    connectionId: string,
  ): Promise<{ accessToken: string; expiresAtEpochSec: number }> {
    const row = await this.ownedRowOrThrow(user, connectionId);
    const providerId = requireProviderId(row.providerType);
    const tokens = this.openTokens(row.encryptedTokensJson);

    const nowSec = Math.floor(Date.now() / 1000);
    if (tokens.expiresAtEpochSec - nowSec > TOKEN_REFRESH_MARGIN_SEC) {
      return { accessToken: tokens.accessToken, expiresAtEpochSec: tokens.expiresAtEpochSec };
    }
    if (!tokens.refreshToken) {
      throw new UnauthorizedException({ code: 'CONNECTION_EXPIRED', message: 'Reconnect required' });
    }

    const refreshed = await this.refreshBinding(providerId, tokens.refreshToken);
    await this.prisma.providerConnection.update({
      where: { id: row.id },
      data: { encryptedTokensJson: sealJson(this.config.envelopeKey, refreshed), status: 'OK' },
    });
    return { accessToken: refreshed.accessToken, expiresAtEpochSec: refreshed.expiresAtEpochSec };
  }

  /** Ready-to-use adapter bound to a fresh-token getter for one call-site. */
  async adapterFor(
    user: NafUser,
    connectionId: string,
  ): Promise<{ providerId: ProviderId; remoteRootFolder: string | null; adapter: import('@naf/providers').StorageProvider }> {
    const row = await this.ownedRowOrThrow(user, connectionId);
    const providerId = requireProviderId(row.providerType);
    const binding = this.bindingFor(providerId);

    const getter = async (): Promise<string> => {
      const { accessToken } = await this.freshAccessToken(user, connectionId);
      return accessToken;
    };
    return { providerId, remoteRootFolder: row.remoteRootFolder, adapter: binding.newAdapter(getter) };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async exchangeAndStore(
    userId: string,
    providerId: ProviderId,
    code: string,
  ): Promise<OAuthTokenSet> {
    const binding = this.bindingFor(providerId);
    const oauth = this.oauthConfigFor(providerId);
    const tokens = await binding.exchangeCode(oauth, code);
    if (!tokens.refreshToken) {
      throw new InternalServerErrorException('OAUTH_NO_REFRESH_TOKEN');
    }

    const adapter = binding.newAdapter(async () => tokens.accessToken);
    const remoteRootFolder = await ensureRootFolder(binding, adapter);

    let quotaTotalBytes: bigint | null = null;
    let quotaUsedBytes: bigint | null = null;
    try {
      const quota = await adapter.getQuota();
      quotaTotalBytes = BigInt(quota.totalBytes);
      quotaUsedBytes = BigInt(quota.usedBytes);
    } catch (err) {
      this.logger.warn(`Post-link quota fetch failed (${providerId}): ${String(err)}`);
    }

    const shared = {
      encryptedTokensJson: sealJson(this.config.envelopeKey, tokens),
      remoteRootFolder,
      status: 'OK' as const,
      lastSyncedAt: new Date(),
      ...(quotaTotalBytes != null ? { quotaTotalBytes } : {}),
      ...(quotaUsedBytes != null ? { quotaUsedBytes } : {}),
    };

    // Public route — the guard never ran, so provision the owner row first
    // or the FK on provider_connections.user_id explodes.
    await this.users.ensureUser({ id: userId });

    await this.prisma.providerConnection.upsert({
      where: { userId_providerType: { userId, providerType: toDbEnum(providerId) } },
      update: shared,
      create: {
        userId,
        providerType: toDbEnum(providerId),
        displayName: providerId === 'google-drive' ? 'Google Drive' : 'Dropbox',
        capPct: 100,
        ...shared,
      },
    });
    return tokens;
  }

  private async refreshBinding(providerId: ProviderId, refreshToken: string): Promise<OAuthTokenSet> {
    const binding = this.bindingFor(providerId);
    if (!binding.isConfigured(this.config)) {
      throw new ServiceUnavailableException(`PROVIDER_NOT_CONFIGURED: ${providerId}`);
    }
    const oauth = this.oauthConfigFor(providerId);
    return binding.refreshToken({ clientId: oauth.clientId, clientSecret: oauth.clientSecret }, refreshToken);
  }

  private oauthConfigFor(providerId: ProviderId) {
    const binding = this.bindingFor(providerId);
    const redirectUri = `${this.config.apiPublicUrl}/v1/connections/callback/${providerId}`;
    return binding.oauthConfig(this.config, redirectUri);
  }

  private stateSecret(): Uint8Array {
    // Raw envelope-key bytes double as the OAuth-state HMAC secret (server-side only).
    return this.config.envelopeKey.slice(0, 32);
  }

  private bindingFor(providerId: ProviderId) {
    if (!(SUPPORTED_PROVIDER_IDS as readonly string[]).includes(providerId)) {
      throw new NotFoundException(`Unsupported provider: ${providerId}`);
    }
    return PROVIDER_BINDINGS[providerId as keyof typeof PROVIDER_BINDINGS];
  }

  private openTokens(blob: Uint8Array): OAuthTokenSet {
    return openJson<OAuthTokenSet>(this.config.envelopeKey, blob);
  }

  private async ownedRowOrThrow(user: NafUser, connectionId: string) {
    const row = await this.prisma.providerConnection.findFirst({
      where: { id: connectionId, userId: user.id },
    });
    if (!row) throw new NotFoundException('Connection not found');
    return row as ProviderConnectionRow;
  }

  private toDto(row: NonNullable<ProviderConnectionRow>): ConnectionDto {
    return {
      id: row.id,
      providerType: requireProviderId(row.providerType),
      displayName: row.displayName,
      capPct: row.capPct,
      status: row.status,
      quotaTotalBytes: safeNumber(row.quotaTotalBytes),
      quotaUsedBytes: safeNumber(row.quotaUsedBytes),
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function requireProviderId(dbValue: string): ProviderId {
  const id = fromDbEnum(dbValue);
  if (!id) throw new InternalServerErrorException(`Stored unknown provider: ${dbValue}`);
  return id;
}

function safeNumber(value: bigint | null): number | null {
  if (value == null) return null;
  return Number(value);
}
