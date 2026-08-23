'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConnectionDto } from '@naf/shared';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { disconnectConnection, listConnections, setConnectionCap, startConnect } from '@/lib/api-client';

export function ConnectionsPanel() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    const reason = searchParams.get('reason');
    if (connected) setBanner({ ok: true, text: `${labelFor(connected)} connected successfully.` });
    if (error) setBanner({ ok: false, text: `Connection failed: ${prettyError(error, reason)}` });
  }, [searchParams]);

  const connectionsQuery = useQuery({ queryKey: ['connections'], queryFn: listConnections });

  const disconnectMut = useMutation({
    mutationFn: disconnectConnection,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['connections'] }),
  });
  const capMut = useMutation({
    mutationFn: ({ id, capPct }: { id: string; capPct: number }) => setConnectionCap(id, capPct),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['connections'] }),
  });

  async function refreshQuota(id: string): Promise<void> {
    // Quota sync worker arrives in the next milestone — for now re-link-time only.
    void id;
  }
  void refreshQuota;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected cloud accounts</CardTitle>
        <CardDescription>
          NAF Drive stores files inside YOUR accounts and respects the usage cap you set per
          account. OAuth tokens are encrypted at rest; file bytes never pass through our servers.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {banner && (
          <div className={`rounded-md p-3 text-sm ${banner.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
            {banner.text}
          </div>
        )}

        {connectionsQuery.isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
        {connectionsQuery.error != null && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            API unreachable — start <code>apps/api</code> locally to manage connections.
          </p>
        )}

        {(connectionsQuery.data ?? []).map((c) => (
          <div key={c.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span aria-hidden>{c.providerType === 'google-drive' ? '🟢' : '🔵'}</span>
                <span className="font-medium">{c.displayName}</span>
                <span className={`text-xs ${c.status === 'OK' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  ● {c.status}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Disconnect ${c.displayName}? Files already stored stay in your drive.`)) {
                    disconnectMut.mutate(c.id);
                  }
                }}
              >
                Disconnect
              </Button>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{formatBytes(c.quotaUsedBytes)} used</span>
                <span>cap {c.capPct}% · {formatBytes(capBytes(c))} usable by NAF</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                defaultValue={c.capPct}
                className="mt-1 w-full accent-indigo-600"
                onMouseUp={(e) => capMut.mutate({ id: c.id, capPct: Number((e.target as HTMLInputElement).value) })}
                onTouchEnd={(e) => capMut.mutate({ id: c.id, capPct: Number((e.target as HTMLInputElement).value) })}
                onKeyUp={(e) => capMut.mutate({ id: c.id, capPct: Number((e.target as HTMLInputElement).value) })}
              />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-3">
          {!hasProvider(connectionsQuery.data, 'google-drive') && (
            <Button variant="secondary" onClick={() => void startConnect('google-drive')}>
              🟢 Connect Google Drive
            </Button>
          )}
          {!hasProvider(connectionsQuery.data, 'dropbox') && (
            <Button variant="secondary" onClick={() => void startConnect('dropbox')}>
              🔵 Connect Dropbox
            </Button>
          )}
        </div>

        <p className="text-xs text-zinc-400">
          OneDrive, pCloud and Box land in Phase 2.
        </p>
      </CardContent>
    </Card>
  );
}

function hasProvider(list: ConnectionDto[] | undefined, id: 'google-drive' | 'dropbox'): boolean {
  return (list ?? []).some((c) => c.providerType === id);
}

function labelFor(providerId: string): string {
  return providerId === 'google-drive' ? 'Google Drive' : providerId === 'dropbox' ? 'Dropbox' : providerId;
}

function prettyError(code: string, reason?: string | null): string {
  const known: Record<string, string> = {
    redirect_uri_mismatch:
      'Redirect URI mismatch — the value in the provider console must EXACTLY equal the API_PUBLIC_URL-based callback (see README).',
    invalid_client:
      'Client ID/Secret rejected — re-copy both values and restart the API.',
    invalid_grant:
      'Authorization code expired or already used — click Connect again.',
    no_refresh_token:
      'Provider returned no refresh token — disconnect, then connect again (re-consent).',
    api_disabled:
      'Enable the provider API first: Google Cloud → APIs & Services → Drive API → Enable.',
    provider_api_error:
      'Provider rejected a post-link call (root folder/quota) — check API logs for detail.',
    access_denied: 'You declined the permission prompt.',
    bad_state: 'The link expired — try connecting again.',
  };
  if (reason && known[reason]) return `${known[reason]} [${reason}]`;
  if (code === 'access_denied') return 'You declined the permission prompt.';
  if (code === 'bad_state') return 'The link expired — please try connecting again.';
  if (code === 'exchange_failed') {
    return reason
      ? `Provider said: ${reason} — see README troubleshooting table.`
      : 'Token exchange failed — check the API terminal log for the raw provider error.';
  }
  return code;
}

function capBytes(c: Pick<ConnectionDto, 'quotaTotalBytes' | 'capPct'>): number {
  return Math.floor(((c.quotaTotalBytes ?? 0) * c.capPct) / 100);
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
