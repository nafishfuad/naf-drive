import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/env.schema';

const baseEnv = {
  SUPABASE_URL: 'https://abc.supabase.co',
  DATABASE_URL: 'postgresql://naf:naf_dev@localhost:54322/naf_drive',
};

describe('loadConfig', () => {
  it('derives the JWKS url from the supabase url', () => {
    const cfg = loadConfig({ ...baseEnv });
    expect(cfg.supabaseJwksUrl).toBe('https://abc.supabase.co/auth/v1/.well-known/jwks.json');
    expect(cfg.port).toBe(3001);
    expect(cfg.corsOrigin).toBe('http://localhost:3000');
  });

  it('honors explicit overrides', () => {
    const cfg = loadConfig({
      ...baseEnv,
      PORT: '4000',
      CORS_ORIGIN: 'https://app.example.com',
      SUPABASE_JWKS_URL: 'https://custom/jwks.json',
    });
    expect(cfg.port).toBe(4000);
    expect(cfg.corsOrigin).toBe('https://app.example.com');
    expect(cfg.supabaseJwksUrl).toBe('https://custom/jwks.json');
  });

  it('fails fast on missing required variables', () => {
    expect(() => loadConfig({})).toThrowError(/SUPABASE_URL/);
    expect(() => loadConfig({ SUPABASE_URL: 'x' })).toThrowError(/DATABASE_URL/);
  });

  it('rejects non-numeric ports', () => {
    expect(() => loadConfig({ ...baseEnv, PORT: 'http' })).toThrowError(/Invalid PORT/);
  });
});
