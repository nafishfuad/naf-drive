'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, getVaultStatus } from '@/lib/api-client';
import type { VaultStatusResponse } from '@naf/shared';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; status: VaultStatusResponse }
  | { kind: 'unreachable'; message: string };

export function VaultStatusCard() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getVaultStatus()
      .then((res) => {
        if (!cancelled) setState({ kind: 'ready', status: res });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'unreachable',
          message:
            err instanceof ApiError
              ? `${err.code}: ${err.message}`
              : 'API unreachable — is apps/api running with a .env configured?',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Private Vault</CardTitle>
        <CardDescription>
          Optional upgrade. In Standard mode your files are stored plainly in your own cloud
          drives — we route metadata (names, sizes, folders) but never your file bytes. Private
          Vault encrypts contents and even provider-side filenames in your browser with keys only
          you hold.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        {state.kind === 'loading' && <p className="text-sm text-zinc-500">Checking…</p>}

        {state.kind === 'unreachable' && (
          <p className="text-sm text-amber-600 dark:text-amber-400">{state.message}</p>
        )}

        {state.kind === 'ready' && state.status.storageMode === 'VAULT' && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            ✓ Private Vault active — uploads and filenames are end-to-end encrypted. Keep your
            passphrase and recovery phrase safe.
          </p>
        )}

        {state.kind === 'ready' &&
          (state.status.storageMode === 'STANDARD' || !state.status.vaultInitialized) && (
            <>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Currently off — you&apos;re using Standard mode.
              </p>
              <Link href="/setup-vault">
                <Button size="sm">Enable Private Vault</Button>
              </Link>
            </>
          )}
      </CardContent>
    </Card>
  );
}
