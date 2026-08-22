import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const FEATURES = [
  {
    title: 'All your clouds, one drive',
    description:
      'Connect Google Drive, Dropbox and more. NAF Drive shows a single file system across every account.',
  },
  {
    title: 'Optional Private Vault',
    description:
      'By default your files live plainly in your own drives. Flip on Private Vault and everything is encrypted in-browser with keys only you hold.',
  },
  {
    title: 'Direct transfers',
    description:
      'Data flows between your device and your own cloud accounts — never stored on our servers.',
  },
];

export default async function HomePage() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) redirect('/drive');
    } catch (error) {
      if ((error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw error;
      // Supabase unreachable — render the landing page instead of crashing.
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-12 px-6 py-16">
      <header className="text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          NAF Drive
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          One private drive over{' '}
          <span className="text-indigo-600 dark:text-indigo-400">all your clouds</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-500 dark:text-zinc-400">
          Bring your existing Google Drive, Dropbox and more. We unify them into one clean file
          system — using the storage you already have.
        </p>
      </header>

      <section className="grid w-full gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <CardTitle>{f.title}</CardTitle>
              <CardDescription>{f.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Link href="/login">
          <Button>Sign in</Button>
        </Link>
        <Link href="/register">
          <Button variant="secondary">Create account</Button>
        </Link>
      </div>
    </main>
  );
}
