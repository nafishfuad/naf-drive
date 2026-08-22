'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SignOutButton } from '@/components/sign-out-button';

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <button
            type="button"
            className="flex items-center gap-2 font-semibold"
            onClick={() => router.push('/drive')}
          >
            <span className="grid size-7 place-items-center rounded-md bg-indigo-600 text-sm text-white">
              N
            </span>
            NAF Drive
          </button>

          <nav className="hidden items-center gap-1 sm:flex">
            <a
              href="/drive"
              className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              My Drive
            </a>
            <a
              href="/settings"
              className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Settings
            </a>
            <SignOutButton />
          </nav>

          <button
            type="button"
            aria-label="Menu"
            className="sm:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            ≡
          </button>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-zinc-200 p-3 sm:hidden dark:border-zinc-800">
            <a href="/drive" className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100">
              My Drive
            </a>
            <a href="/settings" className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100">
              Settings
            </a>
            <SignOutButton />
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      {userEmail && (
        <p className="pb-6 text-center text-xs text-zinc-400">{userEmail}</p>
      )}
    </div>
  );
}
