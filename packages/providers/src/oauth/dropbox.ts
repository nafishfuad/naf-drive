import type { OAuthTokenSet, ProviderOAuthConfig } from './oauth-common';
import { nowEpochSec, postForm } from './oauth-common';

const AUTH_BASE = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
/** Scoped app permissions — pair with an "App folder" Dropbox app for hard scoping. */
export const DROPBOX_SCOPES = ['files.content.write', 'files.content.read'];

export function buildDropboxAuthUrl(config: ProviderOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    token_access_type: 'offline',
    scope: DROPBOX_SCOPES.join(' '),
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export async function exchangeDropboxCode(
  config: ProviderOAuthConfig,
  code: string,
): Promise<OAuthTokenSet> {
  const json = await postForm(TOKEN_URL, {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });
  return tokenSetFromResponse(json);
}

export async function refreshDropboxToken(
  config: Pick<ProviderOAuthConfig, 'clientId' | 'clientSecret'>,
  refreshToken: string,
): Promise<OAuthTokenSet> {
  const json = await postForm(TOKEN_URL, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return { ...tokenSetFromResponse(json), refreshToken };
}

function tokenSetFromResponse(json: Record<string, unknown>): OAuthTokenSet {
  if (typeof json['access_token'] !== 'string') {
    throw new Error('OAUTH_TOKEN_ERROR: missing access_token');
  }
  if (typeof json['refresh_token'] !== 'string') {
    throw new Error('OAUTH_TOKEN_ERROR: missing refresh_token');
  }
  const expiresIn = typeof json['expires_in'] === 'number' ? json['expires_in'] : 14400;
  return {
    accessToken: json['access_token'],
    refreshToken: json['refresh_token'],
    expiresAtEpochSec: nowEpochSec() + expiresIn - 60,
  };
}
