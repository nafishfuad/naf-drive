import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VaultStatusCard } from '@/app/(drive-app)/settings/vault-status-card';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect('/dashboard');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <AppShell userEmail={user.email ?? undefined}>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <VaultStatusCard />

        <Card>
          <CardHeader>
            <CardTitle>Connected cloud accounts</CardTitle>
            <CardDescription>
              Link the storage you already own. NAF Drive will use each account&apos;s free space,
              limited by a cap you control.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {['Google Drive', 'Dropbox', 'OneDrive · coming soon'].map((label) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700"
              >
                <span>{label}</span>
                <span className="text-xs uppercase tracking-wide text-zinc-400">Phase 1</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>
              TOTP authenticator support is enabled through your Supabase project. Enrollment UI
              ships in Phase&nbsp;2 — enable it from Supabase Auth settings meanwhile.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
