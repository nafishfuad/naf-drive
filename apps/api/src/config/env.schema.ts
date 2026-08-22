export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  supabaseUrl: string;
  /** Defaults to `${supabaseUrl}/auth/v1/.well-known/jwks.json` when not provided. */
  supabaseJwksUrl: string;
}

const DEV_DEFAULTS = {
  PORT: 3001,
  CORS_ORIGIN: 'http://localhost:3000',
} as const;

/**
 * Parses + validates env at boot (fail fast). Only this module may touch
 * process.env per AGENTS.md §3.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const supabaseUrl = requireEnv(env, 'SUPABASE_URL');
  const databaseUrl = requireEnv(env, 'DATABASE_URL');

  const port = Number.parseInt(env['PORT'] ?? String(DEV_DEFAULTS.PORT), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${env['PORT']}`);
  }

  const corsOrigin = env['CORS_ORIGIN'] ?? DEV_DEFAULTS.CORS_ORIGIN;

  return {
    env: (env['NODE_ENV'] as AppConfig['env']) ?? 'development',
    port,
    corsOrigin,
    databaseUrl,
    supabaseUrl,
    supabaseJwksUrl:
      env['SUPABASE_JWKS_URL'] ?? `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`,
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}. See .env.example.`);
  }
  return value.trim();
}
