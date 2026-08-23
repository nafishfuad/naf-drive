import type { OAuthTokenSet, ProviderOAuthConfig } from './oauth-common';
import { nowEpochSec, postForm } from './oauth-common';

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * drive.file = least privilege: NAF can only see/modify files it created.
 * access_type=offline + prompt=consent guarantee a refresh_token on first link.
 */
export function buildGoogleAuthUrl(config: ProviderOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export async function exchangeGoogleCode(
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

export async function refreshGoogleToken(
  config: Pick<ProviderOAuthConfig, 'clientId' | 'clientSecret'>,
  refreshToken: string,
): Promise<OAuthTokenSet> {
  const json = await postForm(TOKEN_URL, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return {
    ...tokenSetFromResponse(json),
    // Refresh responses never include a new refresh_token — keep the existing one.
    refreshToken,
  };
}

function tokenSetFromResponse(json: Record<string, unknown>): OAuthTokenSet {
  if (typeof json['access_token'] !== 'string') {
    throw new Error('OAUTH_TOKEN_ERROR: missing access_token');
  }
  const expiresIn = typeof json['expires_in'] === 'number' ? json['expires_in'] : 3600;
  return {
    accessToken: json['access_token'],
    refreshToken:
      typeof json['refresh_token'] === 'string' ? json['refresh_token'] : undefined,
    expiresAtEpochSec: nowEpochSec() + expiresIn - 60,
  };
}
