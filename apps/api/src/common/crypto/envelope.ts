import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD = new TextEncoder().encode('naf-drive:v1:connection-tokens');

/**
 * Seals any JSON-serializable value into one opaque byte blob:
 * [12B iv][16B auth tag][ciphertext]. Used exclusively for OAuth token sets
 * at rest — plaintext never touches the database (AGENTS.md hard rule #2).
 */
export function sealJson(key: Uint8Array, value: unknown): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(AAD);
  const ciphertext = cipher.update(new TextEncoder().encode(JSON.stringify(value)));
  cipher.final();
  const out = new Uint8Array(IV_BYTES + TAG_BYTES + ciphertext.length);
  out.set(iv, 0);
  out.set(cipher.getAuthTag(), IV_BYTES);
  out.set(ciphertext, IV_BYTES + TAG_BYTES);
  return out;
}

/** Inverse of sealJson. Throws if tampered or keyed with the wrong key. */
export function openJson<T>(key: Uint8Array, blob: Uint8Array): T {
  if (blob.length < IV_BYTES + TAG_BYTES) throw new Error('ENVELOPE_MALFORMED');
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const plain = decipher.update(ciphertext);
  decipher.final();
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
