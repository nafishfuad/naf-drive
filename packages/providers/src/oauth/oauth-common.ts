/** Shared OAuth plumbing types used by every provider module. */

export interface OAuthTokenSet {
  accessToken: string;
  /** Absent only for Google re-consent edge flows — treat as required at link time. */
  refreshToken?: string;
  /** Absolute epoch seconds after which accessToken stops working. */
  expiresAtEpochSec: number;
}

export interface ProviderOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errText =
      typeof json['error_description'] === 'string'
        ? json['error_description']
        : typeof json['error'] === 'string'
          ? json['error']
          : `HTTP ${res.status}`;
    throw new Error(`OAUTH_TOKEN_ERROR: ${errText}`);
  }
  return json;
}

export function nowEpochSec(): number {
  return Math.floor(Date.now() / 1000);
}
