export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  supabaseUrl: string;
  /** Defaults to `${supabaseUrl}/auth/v1/.well-known/jwks.json` when not provided. */
  supabaseJwksUrl: string;

  /** Root of AES-256-GCM envelope encryption (OAuth tokens at rest). Required. */
  envelopeKey: Uint8Array<ArrayBuffer>;

  /** Where browsers live — OAuth callbacks bounce back here. */
  webAppUrl: string;
  /** Public origin of THIS api — used to build provider redirect_uris. */
  apiPublicUrl: string;

  google?: { clientId: string; clientSecret: string };
  dropbox?: { clientId: string; clientSecret: string };
}

const DEV_DEFAULTS = {
  PORT: 3001,
  CORS_ORIGIN: 'http://localhost:3000',
  WEB_APP_URL: 'http://localhost:3000',
  API_PUBLIC_URL: 'http://localhost:3001',
} as const;

function optionalPair(env: NodeJS.ProcessEnv, idKey: string, secretKey: string) {
  const clientId = env[idKey]?.trim();
  const clientSecret = env[secretKey]?.trim();
  if (!clientId && !clientSecret) return undefined;
  if (!clientId || !clientSecret) {
    throw new Error(`Set both ${idKey} and ${secretKey} (or neither).`);
  }
  return { clientId, clientSecret };
}

/**
 * Parses + validates env at boot (fail fast). Only this module may touch
 * process.env per AGENTS.md §3.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const supabaseUrl = requireEnv(env, 'SUPABASE_URL');
  const databaseUrl = requireEnv(env, 'DATABASE_URL');
  const envelopeKey = decodeEnvelopeKey(requireEnv(env, 'ENVELOPE_MASTER_KEY_B64'));

  const port = Number.parseInt(env['PORT'] ?? String(DEV_DEFAULTS.PORT), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${env['PORT']}`);
  }

  return {
    env: (env['NODE_ENV'] as AppConfig['env']) ?? 'development',
    port,
    corsOrigin: env['CORS_ORIGIN'] ?? DEV_DEFAULTS.CORS_ORIGIN,
    databaseUrl,
    envelopeKey,
    webAppUrl: trimSlash(env['WEB_APP_URL'] ?? DEV_DEFAULTS.WEB_APP_URL),
    apiPublicUrl: trimSlash(env['API_PUBLIC_URL'] ?? DEV_DEFAULTS.API_PUBLIC_URL),
    supabaseUrl,
    supabaseJwksUrl:
      env['SUPABASE_JWKS_URL'] ?? `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`,
    google: optionalPair(env, 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
    dropbox: optionalPair(env, 'DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET'),
  };
}

/** Envelope keys must be exactly 32 random bytes, base64-encoded. */
function decodeEnvelopeKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) {
    throw new Error(
      `ENVELOPE_MASTER_KEY_B64 must decode to exactly 32 bytes (got ${decoded.length}). Generate: openssl rand -base64 32`,
    );
  }
  // Fresh ArrayBuffer-backed copy — never a Buffer view over pooled memory.
  const key = new Uint8Array(decoded.length);
  key.set(decoded);
  return key;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}. See .env.example.`);
  }
  return value.trim();
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}
