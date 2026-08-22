import { argon2id } from 'hash-wasm';

import type { Bytes } from './keys';

/**
 * Argon2id parameters tuned for ~100ms in a modern browser at 64 MiB.
 * Stored inside every envelope so they can be raised later without
 * breaking old wraps.
 */
export const KDF_PARAMS = {
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 1,
} as const;

export interface KdfParams {
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
}

async function argon2idBytes(
  secret: string,
  salt: Bytes,
  params: KdfParams,
): Promise<Bytes> {
  if (
    !Number.isInteger(params.memoryKiB) ||
    params.memoryKiB < 8192 ||
    !Number.isInteger(params.iterations) ||
    params.iterations < 1 ||
    !Number.isInteger(params.parallelism) ||
    params.parallelism < 1
  ) {
    throw new Error('VAULT_ENVELOPE_INVALID_KDF_PARAMS');
  }

  const hash = await argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  });
  return hash as Bytes;
}

/** Derives an AES-GCM wrap key from a user secret (passphrase or phrase). */
export async function deriveWrapKey(secret: string, salt: Bytes): Promise<CryptoKey> {
  const hash = await argon2idBytes(secret, salt, KDF_PARAMS);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Re-derives the wrap key using parameters recorded in an existing envelope. */
export async function deriveWrapKeyWithParams(
  secret: string,
  salt: Bytes,
  params: KdfParams,
): Promise<CryptoKey> {
  const hash = await argon2idBytes(secret, salt, params);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
