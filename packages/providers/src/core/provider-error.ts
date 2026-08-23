import type { ProviderId } from '@naf/shared';

/** Normalized provider-side failure. `status` is OUR http-ish code, not the vendor's. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }

  static async fromResponse(provider: ProviderId | 'oauth', res: Response): Promise<ProviderError> {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    // Map rate limiting to 429 so callers apply backoff; auth failures to 401.
    const status = res.status === 401 ? 401 : res.status === 429 ? 429 : 502;
    return new ProviderError(provider, status, extractMessage(body) ?? `HTTP ${res.status}`, body);
  }
}

/** Google nests `{error:{message}}`; Dropbox uses `{error_summary}`; OAuth plain `{error}`. */
function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { error?: unknown; error_summary?: unknown };
  if (typeof b.error === 'string') return b.error;
  if (typeof b.error_summary === 'string') return b.error_summary;
  if (b.error && typeof b.error === 'object') {
    const msg = (b.error as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return null;
}
