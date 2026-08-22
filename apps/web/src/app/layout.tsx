import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'NAF Drive',
    template: '%s · NAF Drive',
  },
  description:
    'One drive over all your cloud accounts. Direct transfers, optional end-to-end encrypted Private Vault.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh" suppressHydrationWarning>{children}</body>
    </html>
  );
}
