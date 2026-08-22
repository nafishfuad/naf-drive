import { KDF_PARAMS, deriveWrapKey, deriveWrapKeyWithParams } from './kdf';
import { base64ToBytes, bytesToBase64, randomBytes, utf8, type Bytes } from './keys';

/**
 * Envelope format v1 — the ONLY structure stored server-side for key material.
 * Everything inside is ciphertext except public KDF tuning parameters.
 */
export interface WrappedKeyEnvelopeV1 {
  readonly v: 1;
  readonly kdf: 'argon2id';
  readonly m: number;
  readonly t: number;
  readonly p: number;
  /** base64 salt (16 bytes) */
  readonly s: string;
  /** base64 AES-GCM IV (12 bytes) */
  readonly iv: string;
  /** base64 ciphertext of the 32-byte master key */
  readonly ct: string;
}

const AAD = utf8('naf-drive:v1:master-key');
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Seals an already-derived master key under a caller-provided wrap key. */
export async function sealMasterKey(
  masterKey: Bytes,
  wrapKey: CryptoKey,
  saltB64: string,
): Promise<WrappedKeyEnvelopeV1> {
  if (masterKey.length !== 32) throw new Error('VAULT_MASTER_KEY_BAD_LENGTH');

  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, wrapKey, masterKey);

  return {
    v: 1,
    kdf: 'argon2id',
    m: KDF_PARAMS.memoryKiB,
    t: KDF_PARAMS.iterations,
    p: KDF_PARAMS.parallelism,
    s: saltB64,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function wrapMasterKey(
  masterKey: Bytes,
  passphrase: string,
): Promise<WrappedKeyEnvelopeV1> {
  const salt = randomBytes(SALT_BYTES);
  const wrapKey = await deriveWrapKey(passphrase, salt);
  return sealMasterKey(masterKey, wrapKey, bytesToBase64(salt));
}

export async function unwrapMasterKey(
  envelope: WrappedKeyEnvelopeV1,
  passphrase: string,
): Promise<Bytes> {
  if (envelope.v !== 1 || envelope.kdf !== 'argon2id') {
    throw new Error('VAULT_ENVELOPE_UNSUPPORTED_VERSION');
  }

  const params = { memoryKiB: envelope.m, iterations: envelope.t, parallelism: envelope.p };
  const wrapKey = await deriveWrapKeyWithParams(passphrase, base64ToBytes(envelope.s), params);

  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv), additionalData: AAD },
      wrapKey,
      base64ToBytes(envelope.ct),
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error('VAULT_UNWRAP_FAILED');
  }
}
