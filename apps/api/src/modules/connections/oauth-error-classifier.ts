/**
 * Translates thrown OAuth/adapter errors into a SHORT, UI-safe reason code
 * plus an optional server-side detail string for logs/debug mode.
 *
 * Reason codes are stable identifiers the settings panel maps to actionable
 * fix text — never raw provider payloads (those stay in the API logs).
 */
export interface ClassifiedOAuthError {
  code: string;
  detail?: string;
}

export function classifyOAuthError(err: unknown): ClassifiedOAuthError {
  const message = err instanceof Error ? err.message : String(err);

  // Our postForm wrapper surfaces the provider's raw error string here.
  const tokenErr = message.match(/OAUTH_TOKEN_ERROR:\s*(.+)$/i);

  if (tokenErr) {
    const raw = tokenErr[1]!.trim();
    // Plain "HTTP 4xx" bodies mean the provider answered but sent no parseable body.
    const statusMatch = raw.match(/^HTTP\s+(\d{3})$/i);
    if (statusMatch) return { code: `provider_http_${statusMatch[1]}`, detail: message };
    return { code: normalizeReason(raw), detail: message };
  }

  if (message.includes('no refresh_token')) return { code: 'no_refresh_token', detail: message };

  // Network-level failures reaching the provider at all
  if (
    /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|UND_ERR|CERT_|self-signed/i.test(message)
  ) {
    return { code: 'network_error', detail: message };
  }

  // Google "Drive API has not been used in project … or it is disabled"
  if (/has not been used|it is disabled|SERVICE_DISABLED/i.test(message)) {
    return { code: 'api_disabled', detail: message };
  }

  // Adapter-level failures (root folder creation, quota fetch right after link)
  if (message.startsWith('[google-drive]') || message.startsWith('[dropbox]')) {
    return { code: 'provider_api_error', detail: message };
  }

  if (message.includes('ENVELOPE')) return { code: 'server_crypto', detail: message };

  return { code: 'unknown', detail: message };
}

function normalizeReason(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 64);
}
