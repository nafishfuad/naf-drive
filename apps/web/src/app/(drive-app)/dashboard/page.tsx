import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Dashboard' };

export default async function DrivePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <CardTitle>Supabase not configured</CardTitle>
            <CardDescription>
              Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase project
              URL and anon key, then restart the dev server.
            </CardDescription>
          </CardHeader>
        </Card>
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
      <div className="flex h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader className="items-center">
            <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-indigo-100 text-xl dark:bg-indigo-950">
              ☁️
            </div>
            <CardTitle>Your drive is empty</CardTitle>
            <CardDescription>
              Connect Google Drive or Dropbox in Settings and your files will appear here.
              Provider connections arrive in Phase&nbsp;1.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
