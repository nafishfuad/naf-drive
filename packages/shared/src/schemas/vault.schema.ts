import { z } from 'zod';

import type { StorageMode } from './storage-mode.schema';

const base64Schema = (maxLength: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64')
    .max(maxLength);

const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/, 'must be sha256 hex');

export const RECOVERY_PHRASE_WORDS = 24;

/**
 * POST /v1/vault/init — enables Private Vault on an account.
 * Wraps are produced client-side; the server stores ciphertext envelopes
 * plus a phrase-check hash (never the phrase or keys themselves).
 */
export const vaultInitRequestSchema = z
  .object({
    wrappedWithPassphrase: base64Schema(8192),
    wrappedWithPhrase: base64Schema(8192),
    /** sha256(recovery phrase) lets us detect wrong-phrase attempts without storing it. */
    phraseCheckSha256: sha256HexSchema,
  })
  .strict();

export type VaultInitRequest = z.infer<typeof vaultInitRequestSchema>;

export interface VaultStatusResponse {
  storageMode: StorageMode;
  vaultInitialized: boolean;
}
