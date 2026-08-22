'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/drive';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function completeMfa(factorId: string) {
    const supabase = createSupabaseBrowserClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) throw challengeError;

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: totpCode.replace(/\s/g, ''),
    });
    if (verifyError) throw verifyError;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const pending = factors?.all.find((f) => f.status === 'verified') ?? factors?.all[0];

      if (pending && !pendingFactorId && !totpCode) {
        setPendingFactorId(pending.id);
        return;
      }
      if (pendingFactorId) await completeMfa(pendingFactorId);

      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {pendingFactorId
            ? 'Enter the 6-digit code from your authenticator app'
            : 'Welcome back to NAF Drive'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {!pendingFactorId && (
            <>
              <Input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}
          {pendingFactorId && (
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              autoFocus
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : pendingFactorId ? 'Verify code' : 'Sign in'}
          </Button>

          {!pendingFactorId && (
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              No account?{' '}
              <a href="/register" className="text-indigo-600 hover:underline dark:text-indigo-400">
                Create one
              </a>
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
