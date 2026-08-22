import { describe, expect, it } from 'vitest';

import {
  base64ToBytes,
  bytesToBase64,
  generateMasterKeyBytes,
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
  phraseCheckSha256,
  recoverySalt,
  unwrapMasterKey,
  wrapMasterKey,
} from '../src/lib/vault';

describe('master key wrapping (passphrase)', () => {
  it('round-trips wrap → unwrap', async () => {
    const master = generateMasterKeyBytes();
    const envelope = await wrapMasterKey(master, 'correct horse battery staple');

    const json = JSON.parse(JSON.stringify(envelope));
    const unwrapped = await unwrapMasterKey(json, 'correct horse battery staple');

    expect(bytesToBase64(unwrapped)).toBe(bytesToBase64(master));
  });

  it('rejects a wrong passphrase', async () => {
    const envelope = await wrapMasterKey(generateMasterKeyBytes(), 'right');
    await expect(unwrapMasterKey(envelope, 'wrong')).rejects.toThrowError(/VAULT_UNWRAP_FAILED/);
  });

  it('rejects tampered ciphertext', async () => {
    const master = generateMasterKeyBytes();
    const envelope = await wrapMasterKey(master, 'pw');
    const bytes = base64ToBytes(envelope.ct);
    bytes[0] = bytes[0]! ^ 0xff;
    const tampered = { ...envelope, ct: bytesToBase64(bytes) };
    await expect(unwrapMasterKey(tampered, 'pw')).rejects.toThrowError(/VAULT_UNWRAP_FAILED/);
  });

  it('produces unique salts and IVs per call', async () => {
    const master = generateMasterKeyBytes();
    const a = await wrapMasterKey(master, 'same-passphrase');
    const b = await wrapMasterKey(master, 'same-passphrase');
    expect(a.s).not.toBe(b.s);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe('recovery phrase', () => {
  it('generates valid 24-word phrases', () => {
    const phrase = generateRecoveryPhrase();
    expect(phrase.split(' ')).toHaveLength(24);
    expect(isValidRecoveryPhrase(phrase)).toBe(true);
  });

  it('normalizes casing and whitespace before validation', () => {
    const phrase = generateRecoveryPhrase();
    const mangled = `  ${phrase.toUpperCase().split(' ').join('   ')} `;
    expect(isValidRecoveryPhrase(mangled)).toBe(true);
  });

  it('derives deterministic salt + check for the same phrase', async () => {
    const phrase = generateRecoveryPhrase();
    expect(bytesToBase64(await recoverySalt(phrase))).toBe(
      bytesToBase64(await recoverySalt(` ${phrase.toUpperCase()} `)),
    );
    expect(await phraseCheckSha256(phrase)).toBe(await phraseCheckSha256(phrase));
    expect(await phraseCheckSha256(phrase)).toMatch(/^[a-f0-9]{64}$/);
  });
});
