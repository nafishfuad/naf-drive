import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STORAGE_MODE,
  PROVIDER_IDS,
  RECOVERY_PHRASE_WORDS,
  paginationSchema,
  providerIdSchema,
  storageModeSchema,
  vaultInitRequestSchema,
} from '../src';

describe('paginationSchema', () => {
  it('coerces string limits and applies the default', () => {
    expect(paginationSchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    expect(paginationSchema.parse({})).toEqual({ limit: 50 });
  });

  it('rejects out-of-range limits', () => {
    expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe('storageModeSchema', () => {
  it('accepts the two shipped modes only', () => {
    for (const mode of ['STANDARD', 'VAULT'] as const) {
      expect(storageModeSchema.parse(mode)).toBe(mode);
    }
    expect(storageModeSchema.safeParse('HYBRID').success).toBe(false);
    expect(storageModeSchema.safeParse('PLAIN').success).toBe(false);
    expect(DEFAULT_STORAGE_MODE).toBe('STANDARD');
  });
});

describe('providerIdSchema', () => {
  it('exposes the launch set of providers', () => {
    expect(PROVIDER_IDS).toContain('google-drive');
    expect(PROVIDER_IDS).toContain('dropbox');
    expect(providerIdSchema.safeParse('samsung').success).toBe(false);
  });
});

describe('vaultInitRequestSchema', () => {
  const valid = {
    wrappedWithPassphrase: 'AAEC',
    wrappedWithPhrase: 'AAED',
    phraseCheckSha256: 'a'.repeat(64),
  };

  it('accepts well-formed wraps', () => {
    expect(vaultInitRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects non-base64 blobs and bad hashes and unknown fields', () => {
    expect(
      vaultInitRequestSchema.safeParse({ ...valid, wrappedWithPassphrase: 'not base64!!' })
        .success,
    ).toBe(false);
    expect(vaultInitRequestSchema.safeParse({ ...valid, phraseCheckSha256: 'zz' }).success).toBe(
      false,
    );
    expect(
      vaultInitRequestSchema.safeParse({ ...valid, plaintextKey: 'nope' }).success,
    ).toBe(false);
  });

  it('documents the recovery phrase length contract', () => {
    expect(RECOVERY_PHRASE_WORDS).toBe(24);
  });
});
