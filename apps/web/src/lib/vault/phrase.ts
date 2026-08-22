import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { sha256Hex, utf8, type Bytes } from './keys';

const RECOVERY_STRENGTH_BITS = 256; // → 24 words
const SALT_CONTEXT = 'naf-drive:v1:recovery:';
const SALT_BYTES = 16;

export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, RECOVERY_STRENGTH_BITS);
}

export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normalizePhrase(phrase), wordlist);
}

/** Case/whitespace-insensitive so a hand-typed phrase still works. */
export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ');
}

/** Deterministic KDF salt bound to this exact phrase. */
export async function recoverySalt(phrase: string): Promise<Bytes> {
  const digest = await crypto.subtle.digest('SHA-256', utf8(SALT_CONTEXT + normalizePhrase(phrase)));
  return new Uint8Array(digest.slice(0, SALT_BYTES));
}

/**
 * Sent to the server so it can detect wrong-phrase attempts without ever
 * learning the phrase itself (server stores the hash only).
 */
export function phraseCheckSha256(phrase: string): Promise<string> {
  return sha256Hex(utf8(normalizePhrase(phrase)));
}
