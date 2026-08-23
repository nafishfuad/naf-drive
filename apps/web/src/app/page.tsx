import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SITE_NAME, SITE_URL } from '@/lib/site-url';

const TITLE = `${SITE_NAME} — All Your Cloud Storage, One Clean Drive`;
const DESCRIPTION =
  'Connect Google Drive, Dropbox and more into one fast dashboard. Direct transfers mean your files never touch our servers — plus an optional end-to-end encrypted Private Vault. Free.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    'cloud storage aggregator',
    'google drive',
    'dropbox',
    'onedrive',
    'unified cloud storage',
    'free cloud dashboard',
    'encrypted cloud storage',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

const FEATURES = [
  {
    icon: '🗂️',
    title: 'One unified file system',
    text: 'Connect Google Drive, Dropbox, OneDrive and more. Browse, search and organize everything as a single drive.',
  },
  {
    icon: '⚡',
    title: 'Direct transfers',
    text: 'Files travel straight from your device to your own cloud accounts. Our servers hold metadata only — never your bytes.',
  },
  {
    icon: '🧠',
    title: 'Smart placement with caps',
    text: 'Upload once. NAF Drive picks the account with the most free room, while respecting per-account usage caps you control.',
  },
  {
    icon: '🔒',
    title: 'Private Vault (opt-in)',
    text: 'Flip on end-to-end encryption: contents and even filenames are encrypted in your browser with keys only you hold.',
  },
  {
    icon: '🔗',
    title: 'Share links',
    text: 'Public links with expiry dates, passwords and download limits — coming soon.',
    soon: true,
  },
  {
    icon: '🔎',
    title: 'Cross-provider search',
    text: 'One search box across every connected account — coming soon.',
    soon: true,
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Connect your accounts',
    text: 'Sign in with email and link your existing Google Drive or Dropbox with official OAuth — read/write access to YOUR drives only.',
  },
  {
    n: '2',
    title: 'Manage everything in one dashboard',
    text: 'Uploads land wherever makes the most sense; downloads stream straight back to you. Pause, resume, organize — all in one place.',
  },
  {
    n: '3',
    title: 'Optionally go zero-knowledge',
    text: 'Enable Private Vault and everything you store through NAF Drive is encrypted before it ever leaves your browser.',
  },
];

const TIERS = [
  { label: 'Price', standard: 'Free', vault: 'Free' },
  { label: 'File contents on providers', standard: 'As-is', vault: 'Encrypted client-side' },
  { label: 'Filenames on provider drives', standard: 'Real names', vault: 'Scrambled' },
  { label: 'Extra sign-in step', standard: 'None', vault: 'Vault passphrase' },
  { label: 'Recovery', standard: 'Your provider accounts', vault: '24-word recovery phrase required' },
  { label: 'Best for', standard: 'Simplicity', vault: 'Maximum privacy' },
];

const FAQS = [
  {
    q: 'Do you store my files?',
    a: 'No. Uploads and downloads move directly between your device and your own cloud accounts. We keep only a lightweight metadata index (names, folders, sizes) so your unified view works.',
  },
  {
    q: 'Which cloud providers are supported?',
    a: 'Launching with Google Drive and Dropbox, followed by OneDrive, pCloud and Box. Samsung Cloud is gone forever; MEGA is on the roadmap.',
  },
  {
    q: 'What exactly is Private Vault?',
    a: 'An optional mode where every file is encrypted in your browser before upload — contents and even filenames become unreadable gibberish to providers and to us. You unlock it with a passphrase that we never see.',
  },
  {
    q: 'What happens if I lose my Vault passphrase?',
    a: 'The 24-word recovery phrase issued at setup unwraps your key. If BOTH are lost, vault data is mathematically unrecoverable — by anyone, including us. That is the trade-off for true privacy.',
  },
  {
    q: 'How is NAF Drive free?',
    a: 'Your files consume your storage, not ours. We host only lightweight metadata services, which fits comfortably inside free tiers.',
  },
];

function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function appJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: 'FileManagementApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: DESCRIPTION,
  };
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
      />

      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-md bg-indigo-600 text-sm text-white">
              N
            </span>
            {SITE_NAME}
          </span>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm hover:underline">
              Sign in
            </Link>
            <Link href="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <p className="mb-3 inline-block rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300">
            Your storage. Unified. Free.
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            All your clouds.
            <br />
            <span className="text-indigo-600 dark:text-indigo-400">One clean drive.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-500 dark:text-zinc-400">
            NAF Drive connects the Google Drives and Dropboxes you already have into a single fast
            dashboard. Files stay in your accounts — transferred directly, device to drive.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/register">
              <Button>Try now — it&apos;s free</Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary">See how it works</Button>
            </a>
          </div>
          <p className="mt-4 text-xs text-zinc-400">
            No credit card · Free tier forever · File bytes never stored on our servers
          </p>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">Why NAF Drive</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-zinc-500 dark:text-zinc-400">
              The aggregation layer Mega-style apps forgot: bring your own storage, keep your data
              where it belongs.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title} className={f.soon ? 'opacity-80' : ''}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span aria-hidden>{f.icon}</span>
                      {f.title}
                      {f.soon && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Soon
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>{f.text}</CardDescription>
                  </CardHeader>
                  <CardContent />
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-16">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="text-center">
                  <span className="mx-auto mb-4 grid size-10 place-items-center rounded-full bg-indigo-600 font-bold text-white">
                    {s.n}
                  </span>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Tiers */}
        <section className="border-y border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">Two modes. You choose.</h2>
            <table className="mt-8 w-full border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-3" scope="col">
                    <span aria-hidden> </span>
                  </th>
                  <th className="pb-3" scope="col">
                    Standard 🔓
                  </th>
                  <th className="pb-3" scope="col">
                    Private Vault 🔒
                  </th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((row) => (
                  <tr key={row.label} className="border-t border-zinc-200 dark:border-zinc-800">
                    <th className="py-3 pr-4 text-left font-medium" scope="row">
                      {row.label}
                    </th>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">{row.standard}</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-300">{row.vault}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-16">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">
              Frequently asked questions
            </h2>
            <div className="mt-8 flex flex-col gap-6">
              {FAQS.map((f) => (
                <div key={f.q}>
                  <h3 className="font-semibold">{f.q}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {f.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-indigo-600 py-14 text-center text-white">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready to unify your clouds?</h2>
          <Link
            href="/register"
            className="mt-6 inline-block rounded-md bg-white px-6 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Create your free account
          </Link>
        </section>
      </main>

      <footer className="border-t border-zinc-200 py-8 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-zinc-500 sm:flex-row dark:text-zinc-400">
          <p>© 2026 {SITE_NAME}</p>
          <nav className="flex gap-4">
            <a href="https://github.com/nafishfuad/naf-drive" rel="noopener noreferrer" target="_blank">
              GitHub
            </a>
            <a href="#" aria-disabled>
              Privacy
            </a>
            <a href="#" aria-disabled>
              Terms
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
