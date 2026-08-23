import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { ConnectionsPanel } from '@/components/settings/connections-panel';
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

        <Suspense fallback={<Card><CardContent className="p-5 text-sm text-zinc-500">Loading…</CardContent></Card>}>
          <ConnectionsPanel />
        </Suspense>

        <VaultStatusCard />

        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>
              TOTP enrollment UI ships in Phase 2 — enable it from Supabase Auth settings meanwhile.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
