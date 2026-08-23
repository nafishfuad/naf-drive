import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { DriveView } from '@/components/drive/drive-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <AppShell>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Supabase is not configured. Copy <code>apps/web/.env.example</code> to{' '}
          <code>apps/web/.env.local</code>, add your project URL + anon key, and restart.
        </div>
      </AppShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <AppShell userEmail={user.email ?? undefined}>
      <DriveView />
    </AppShell>
  );
}
