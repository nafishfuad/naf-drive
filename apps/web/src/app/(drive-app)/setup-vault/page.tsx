'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_PATHS, vaultInitRequestSchema, type VaultStatusResponse } from '@naf/shared';

import { apiFetch, getVaultStatus } from '@/lib/api-client';
import {
  bytesToBase64,
  deriveWrapKey,
  generateMasterKeyBytes,
  generateRecoveryPhrase,
  normalizePhrase,
  phraseCheckSha256,
  recoverySalt,
  sealMasterKey,
  utf8,
  wrapMasterKey,
} from '@/lib/vault';

type Step = 'passphrase' | 'phrase';

function envelopeToBase64(envelope: object): string {
  return bytesToBase64(utf8(JSON.stringify(envelope)));
}

export default function SetupVaultPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getVaultStatus()
      .then((res) => {
        if (res.storageMode === 'VAULT') router.replace('/settings');
      })
      .catch(() => undefined);
  }, [router]);

  async function onPassphraseSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (passphrase.length < 10) {
      setError('Passphrase must be at least 10 characters.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return;
    }

    setBusy(true);
    try {
      // Everything below happens in this browser. The master key and the
      // recovery phrase never leave this device in readable form.
      const master = generateMasterKeyBytes();
      const wrappedWithPassphrase = await wrapMasterKey(master, passphrase);

      const phrase = generateRecoveryPhrase();
      const salt = await recoverySalt(phrase);
      const phraseWrapKey = await deriveWrapKey(normalizePhrase(phrase), salt);
      const wrappedWithPhrase = await sealMasterKey(master, phraseWrapKey, bytesToBase64(salt));

      await apiFetch<VaultStatusResponse>(API_PATHS.vaultInit, {
        method: 'POST',
        body: vaultInitRequestSchema.parse({
          wrappedWithPassphrase: envelopeToBase64(wrappedWithPassphrase),
          wrappedWithPhrase: envelopeToBase64(wrappedWithPhrase),
          phraseCheckSha256: await phraseCheckSha256(phrase),
        }),
      });

      setRecoveryPhrase(phrase);
      setStep('phrase');
    } catch (err) {
      setError(
        err instanceof Error
          ? `Enabling Private Vault failed â€” ${err.message}`
          : 'Enabling Private Vault failed unexpectedly.',
      );
    } finally {
      setBusy(false);
    }
  }

  function copyPhrase() {
    void navigator.clipboard.writeText(recoveryPhrase);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-6 py-12">
      {step === 'passphrase' && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Enable Private Vault</CardTitle>
            <CardDescription>
              From now on, everything you store through NAF Drive is encrypted in this browser â€”
              contents and even filenames on your connected drives. Your passphrase wraps the
              encryption key and is never sent to our servers.
            </CardDescription>
            <CardDescription>
              âš ï¸ If you ever forget this passphrase AND lose the recovery phrase shown next, your
              encrypted data cannot be recovered by anyone â€” including us. This cannot be undone
              for already-uploaded vault files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onPassphraseSubmit} className="flex flex-col gap-4">
              <Input
                type="password"
                placeholder="Vault passphrase (min 10 characters)"
                autoComplete="new-password"
                required
                minLength={10}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm passphrase"
                autoComplete="new-password"
                required
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
              />

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <Button type="submit" disabled={busy}>
                {busy ? 'Generating keysâ€¦ (a few seconds)' : 'Enable Private Vault'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 'phrase' && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Your recovery phrase</CardTitle>
            <CardDescription>
              Write these 24 words down and keep them somewhere safe. This is the{' '}
              <strong>only</strong> way to access your vault if you forget your passphrase. We
              cannot show it again and cannot recover it for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ol className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-zinc-50 p-4 font-mono text-sm sm:grid-cols-3 dark:bg-zinc-900">
              {recoveryPhrase.split(' ').map((word, index) => (
                <li key={`${word}-${index}`} className="flex gap-2">
                  <span className="select-none text-zinc-400">{index + 1}.</span>
                  <span>{word}</span>
                </li>
              ))}
            </ol>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copyPhrase}>
                Copy to clipboard
              </Button>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              I have written my recovery phrase down and stored it safely.
            </label>

            <Button disabled={!acknowledged} onClick={() => router.replace('/dashboard')}>
              Finish â€” back to my drive
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
