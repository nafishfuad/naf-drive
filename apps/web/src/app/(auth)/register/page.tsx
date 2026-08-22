'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      if (data.session) {
        router.replace('/drive');
        return;
      }
      setNeedsConfirmation(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            You&apos;ll land straight in your drive — connect your cloud accounts next. A Private
            Vault (optional encryption) can be enabled anytime from Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {needsConfirmation ? (
            <div className="rounded-md bg-indigo-50 p-4 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
              <p className="font-medium">Check your inbox</p>
              <p className="mt-1">
                We sent a confirmation link to <strong>{email}</strong>. Confirm it, then sign in to
                finish setting up your vault.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                placeholder="Password (min 8 characters)"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create account'}
              </Button>

              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                Already registered?{' '}
                <a href="/login" className="text-indigo-600 hover:underline dark:text-indigo-400">
                  Sign in
                </a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
