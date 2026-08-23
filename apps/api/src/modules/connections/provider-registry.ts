import type { ProviderId } from '@naf/shared';
import {
  DropboxProvider,
  GoogleDriveProvider,
  buildDropboxAuthUrl,
  buildGoogleAuthUrl,
  exchangeDropboxCode,
  exchangeGoogleCode,
  refreshDropboxToken,
  refreshGoogleToken,
  type OAuthTokenSet,
  type ProviderOAuthConfig,
  type StorageProvider,
} from '@naf/providers';

import type { AppConfig } from '../../config/env.schema';

export const SUPPORTED_PROVIDER_IDS = ['google-drive', 'dropbox'] as const;

export function toDbEnum(providerId: ProviderId): 'GOOGLE_DRIVE' | 'DROPBOX' {
    if (providerId === 'dropbox') return 'DROPBOX';
    if (providerId === 'google-drive') return 'GOOGLE_DRIVE';
    throw new Error(`Cannot map unsupported provider "${providerId}" to storage enum`);
}

export function fromDbEnum(value: string): ProviderId | null {
  switch (value) {
    case 'GOOGLE_DRIVE':
      return 'google-drive';
    case 'DROPBOX':
      return 'dropbox';
    default:
      return null;
  }
}

export interface ProviderBinding {
  readonly id: ProviderId;
  isConfigured(config: AppConfig): boolean;
  oauthConfig(config: AppConfig, redirectUri: string): ProviderOAuthConfig;
  authUrl(oauth: ProviderOAuthConfig, state: string): string;
  exchangeCode(oauth: ProviderOAuthConfig, code: string): Promise<OAuthTokenSet>;
  refreshToken(
    creds: Pick<ProviderOAuthConfig, 'clientId' | 'clientSecret'>,
    refreshToken: string,
  ): Promise<OAuthTokenSet>;
  newAdapter(getAccessToken: () => Promise<string>): StorageProvider;
}

export const PROVIDER_BINDINGS: Record<(typeof SUPPORTED_PROVIDER_IDS)[number], ProviderBinding> = {
  'google-drive': {
    id: 'google-drive',
    isConfigured: (c) => Boolean(c.google),
    oauthConfig: (c, redirectUri) => ({
      clientId: c.google!.clientId,
      clientSecret: c.google!.clientSecret,
      redirectUri,
    }),
    authUrl: (oauth, state) => buildGoogleAuthUrl(oauth, state),
    exchangeCode: (oauth, code) => exchangeGoogleCode(oauth, code),
    refreshToken: (creds, rt) => refreshGoogleToken(creds, rt),
    newAdapter: (getAccessToken) => new GoogleDriveProvider(getAccessToken),
  },
  dropbox: {
    id: 'dropbox',
    isConfigured: (c) => Boolean(c.dropbox),
    oauthConfig: (c, redirectUri) => ({
      clientId: c.dropbox!.clientId,
      clientSecret: c.dropbox!.clientSecret,
      redirectUri,
    }),
    authUrl: (oauth, state) => buildDropboxAuthUrl(oauth, state),
    exchangeCode: (oauth, code) => exchangeDropboxCode(oauth, code),
    refreshToken: (creds, rt) => refreshDropboxToken(creds, rt),
    newAdapter: (getAccessToken) => new DropboxProvider(getAccessToken),
  },
};

/** NAF Drive's home folder inside each connected account. */
export async function ensureRootFolder(
  binding: ProviderBinding,
  adapter: StorageProvider,
): Promise<string> {
  const root =
    binding.id === 'google-drive' ? await adapter.ensureFolder({ folderId: null }, 'NAF Drive') : await adapter.ensureFolder({ folderId: '' }, 'NAF Drive');
  return root.folderId ?? '/NAF Drive';
}
