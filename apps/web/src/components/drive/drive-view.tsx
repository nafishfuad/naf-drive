'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NodeDto } from '@naf/shared';

import {
  createFolder,
  getVaultStatus,
  listConnections,
  listNodes,
  listTrash,
  purgeNode,
  renameNode,
  restoreNode,
  trashNode,
} from '@/lib/api-client';
import { UploadManager } from '@/lib/transfer/upload-manager';
import { downloadFile } from '@/lib/transfer/downloader';
import { cn } from '@/lib/cn';

interface Crumb {
  id: string | null;
  name: string;
}

interface TrayItem {
  name: string;
  uploaded: number;
  total: number;
  paused: boolean;
  state: 'uploading' | 'done' | 'error';
  error?: string;
}

export function DriveView() {
  const queryClient = useQueryClient();
  const [folderStack, setFolderStack] = useState<Crumb[]>([{ id: null, name: 'My Drive' }]);
  const [showTrash, setShowTrash] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [tray, setTray] = useState<Record<string, TrayItem>>({});
  const [dialog, setDialog] = useState<{ kind: 'new-folder' } | { kind: 'rename'; node: NodeDto } | null>(null);
  const [dialogName, setDialogName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const managerRef = useRef<UploadManager | null>(null);
  const handlesRef = useRef<Map<string, UploadManagerHandle>>(new Map());
  type UploadManagerHandle = ReturnType<UploadManager['start']> extends Promise<infer H> ? H : never;

  const currentFolderId = showTrash ? null : folderStack[folderStack.length - 1]!.id;

  const invalidateNodes = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['nodes'] }),
    [queryClient],
  );

  const events = useMemo(
    () => ({
      onProgress: (id: string, uploaded: number, total: number) =>
        setTray((t) => ({ ...t, [id]: { ...t[id]!, uploaded, total } })),
      onDone: (id: string) => {
        setTray((t) => ({ ...t, [id]: { ...t[id]!, state: 'done', uploaded: t[id]!.total } }));
        invalidateNodes();
        void queryClient.invalidateQueries({ queryKey: ['connections'] });
      },
      onError: (id: string, message: string) =>
        setTray((t) => ({ ...t, [id]: { ...t[id]!, state: 'error', error: message } })),
      onPausedChange: (id: string, paused: boolean) =>
        setTray((t) => ({ ...t, [id]: { ...t[id]!, paused } })),
    }),
    [queryClient, invalidateNodes],
  );

  const getManager = useCallback(() => {
    managerRef.current ??= new UploadManager(events);
    return managerRef.current;
  }, [events]);

  const connectionsQuery = useQuery({ queryKey: ['connections'], queryFn: listConnections });
  const vaultQuery = useQuery({ queryKey: ['vault-status'], queryFn: getVaultStatus });

  const nodesQuery = useQuery({
    queryKey: ['nodes', showTrash ? 'trash' : currentFolderId],
    queryFn: () => (showTrash ? listTrash() : listNodes(currentFolderId)),
  });

  const newFolderMut = useMutation({
    mutationFn: (name: string) => createFolder(currentFolderId, name),
    onSuccess: () => {
      setDialog(null);
      invalidateNodes();
    },
  });
  const renameMut = useMutation({
    mutationFn: ({ node, name }: { node: NodeDto; name: string }) => renameNode(node.id, name),
    onSuccess: () => {
      setDialog(null);
      invalidateNodes();
    },
  });
  const trashMut = useMutation({ mutationFn: trashNode, onSuccess: invalidateNodes });
  const restoreMut = useMutation({ mutationFn: restoreNode, onSuccess: invalidateNodes });
  const purgeMut = useMutation({
    mutationFn: purgeNode,
    onSuccess: invalidateNodes,
    onError: (e) => alert(e instanceof Error ? e.message : 'Purge failed'),
  });

  async function startUploads(files: FileList | File[]): Promise<void> {
    const manager = getManager();
    for (const file of Array.from(files)) {
      if (file.size === 0) continue;
      const pendingKey = `pending-${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`;
      setTray((t) => ({
        ...t,
        [pendingKey]: { name: file.name, uploaded: 0, total: file.size, paused: false, state: 'uploading' },
      }));

      try {
        const handle = await manager.start(file, { parentId: currentFolderId });
        handlesRef.current.set(handle.id, handle);
        setTray((t) => {
          const next = { ...t };
          next[handle.id] = next[pendingKey]!;
          delete next[pendingKey];
          return next;
        });
      } catch (err) {
        setTray((t) => ({
          ...t,
          [pendingKey]: {
            ...t[pendingKey]!,
            state: 'error',
            error: err instanceof Error ? err.message : 'Could not start upload',
          },
        }));
      }
    }
  }

  const visibleNodes = (nodesQuery.data ?? []).filter((n) =>
    search.trim() === '' ? true : n.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const crumbs = showTrash ? [{ id: '', name: 'Trash' }] : folderStack;

  return (
    <div className="flex flex-col gap-4">
      {/* Connected-account strip */}
      <div className="flex flex-wrap items-center gap-3">
        {(connectionsQuery.data ?? []).map((c) => (
          <div key={c.id} className="flex min-w-56 flex-1 items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="text-lg" aria-hidden>{c.providerType === 'google-drive' ? '🟢' : '🔵'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{c.displayName}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, Math.round(((c.quotaUsedBytes ?? 0) / Math.max(1, capBytes(c))) * 100))}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-400">
                {formatBytes(c.quotaUsedBytes)} of {formatBytes(capBytes(c))} cap ({c.capPct}%)
              </p>
            </div>
          </div>
        ))}
        {(connectionsQuery.data?.length ?? 0) === 0 && (
          <Link href="/settings" className="rounded-lg border border-dashed border-indigo-400 px-4 py-3 text-sm text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950">
            + Connect your first cloud account
          </Link>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((crumb, i) => (
            <span key={`${crumb.id ?? 'root'}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-400">/</span>}
              <button
                type="button"
                disabled={showTrash}
                onClick={() => setFolderStack(folderStack.slice(0, i + 1))}
                className={cn('rounded px-2 py-1 hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800', i === crumbs.length - 1 && 'font-semibold')}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-36 rounded-md border border-zinc-300 px-2 text-sm dark:border-zinc-700"
          />
          <button type="button" onClick={() => setView(view === 'grid' ? 'list' : 'grid')} className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700" aria-label="Toggle view">
            {view === 'grid' ? '☰' : '▦'}
          </button>
          {!showTrash && (
            <>
              <button
                type="button"
                onClick={() => {
                  setDialog({ kind: 'new-folder' });
                  setDialogName('');
                }}
                className="rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
              >
                + Folder
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Upload
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowTrash((v) => !v)}
            className={cn('rounded-md border px-3 py-1 text-sm', showTrash ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-zinc-300 dark:border-zinc-700')}
          >
            🗑 Trash
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) void startUploads(e.target.files); e.target.value = ''; }} />

      {/* Drop zone + content */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!showTrash) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!showTrash && e.dataTransfer.files.length > 0) void startUploads(e.dataTransfer.files); }}
        className={cn('relative min-h-[50vh] rounded-xl border-2 border-dashed p-4 transition-colors', dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-zinc-200 dark:border-zinc-800')}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-lg font-medium text-indigo-600">
            Drop files to upload into “{folderStack[folderStack.length - 1]!.name}”
          </div>
        )}

        {nodesQuery.isLoading && <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>}
        {nodesQuery.error && <p className="py-10 text-center text-sm text-red-600">{(nodesQuery.error as Error).message}</p>}

        {!nodesQuery.isLoading && !nodesQuery.error && visibleNodes.length === 0 && (
          <EmptyState showTrash={showTrash} hasConnections={(connectionsQuery.data?.length ?? 0) > 0} />
        )}

        {view === 'grid' && visibleNodes.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visibleNodes.map((node) => (
              <li key={node.id}>
                <NodeCard
                  node={node}
                  inTrash={showTrash}
                  onOpen={() => {
                    setFolderStack((s) => [...s, { id: node.id, name: node.name }]);
                    setSearch('');
                  }}
                  onDownload={() => void downloadFile(node.id).catch((e) => alert(e instanceof Error ? e.message : 'Download failed'))}
                  onRename={() => {
                    setDialog({ kind: 'rename', node });
                    setDialogName(node.name);
                  }}
                  onTrash={() => trashMut.mutate(node.id)}
                  onRestore={() => restoreMut.mutate(node.id)}
                  onPurge={() => {
                    if (confirm(`Permanently delete “${node.name}” from your cloud drive?`)) purgeMut.mutate(node.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {view === 'list' && visibleNodes.length > 0 && (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {visibleNodes.map((node) => (
              <li key={node.id}>
                <NodeRow
                  node={node}
                  inTrash={showTrash}
                  onOpen={() => {
                    setFolderStack((s) => [...s, { id: node.id, name: node.name }]);
                    setSearch('');
                  }}
                  onDownload={() => void downloadFile(node.id).catch((e) => alert(e instanceof Error ? e.message : 'Download failed'))}
                  onRename={() => {
                    setDialog({ kind: 'rename', node });
                    setDialogName(node.name);
                  }}
                  onTrash={() => trashMut.mutate(node.id)}
                  onRestore={() => restoreMut.mutate(node.id)}
                  onPurge={() => {
                    if (confirm(`Permanently delete “${node.name}” from your cloud drive?`)) purgeMut.mutate(node.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upload tray */}
      {Object.keys(tray).length > 0 && (
        <div className="fixed bottom-4 right-4 z-20 flex w-80 flex-col gap-2">
          {Object.entries(tray).map(([id, item]) => {
            const handle = handlesRef.current.get(id);
            const pct = item.total ? Math.round((item.uploaded / item.total) * 100) : 0;
            return (
              <div key={id} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <span className={cn('text-[10px] uppercase', item.state === 'done' && 'text-emerald-600', item.state === 'error' && 'text-red-500', item.state === 'uploading' && 'text-zinc-400')}>
                    {item.state}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div className={cn('h-full rounded-full transition-all', item.state === 'error' ? 'bg-red-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{formatBytes(item.uploaded)} / {formatBytes(item.total)}</span>
                  {item.state === 'uploading' && handle && (
                    <span className="flex gap-2">
                      <button type="button" className="hover:text-indigo-500" onClick={() => (item.paused ? handle.resume() : handle.pause())}>
                        {item.paused ? '▶' : '⏸'}
                      </button>
                      <button type="button" className="hover:text-red-500" onClick={() => handle.cancel()}>
                        ✕
                      </button>
                    </span>
                  )}
                </div>
                {item.error && <p className="mt-1 text-[11px] text-red-500">{item.error}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Name dialog */}
      {dialog && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 font-semibold">
              {dialog.kind === 'new-folder' ? 'New folder' : `Rename “${dialog.node.name}”`}
            </h3>
            <input
              autoFocus
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !dialogName.trim()) return;
                if (dialog.kind === 'new-folder') newFolderMut.mutate(dialogName.trim());
                else renameMut.mutate({ node: dialog.node, name: dialogName.trim() });
              }}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              placeholder="Name"
            />
            {(newFolderMut.error != null || renameMut.error != null) && (
              <p className="mt-2 text-xs text-red-600">
                {String((newFolderMut.error ?? renameMut.error) as unknown)}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!dialogName.trim()}
                onClick={() => {
                  if (dialog.kind === 'new-folder') newFolderMut.mutate(dialogName.trim());
                  else renameMut.mutate({ node: dialog.node, name: dialogName.trim() });
                }}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {dialog.kind === 'new-folder' ? 'Create' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── node cards/rows ────────────────────────────────────────────────────────

interface NodeActionsProps {
  node: NodeDto;
  inTrash: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
}

function ActionButtons(props: NodeActionsProps): React.ReactNode {
  const btn = 'rounded p-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700';
  if (props.inTrash) {
    return (
      <span className="ml-auto flex shrink-0 gap-1">
        <button type="button" title="Restore" className={btn} onClick={(e) => { e.stopPropagation(); props.onRestore(); }}>♻️</button>
        <button type="button" title="Delete forever" className={btn} onClick={(e) => { e.stopPropagation(); props.onPurge(); }}>❌</button>
      </span>
    );
  }
  return (
    <span className="ml-auto flex shrink-0 gap-1">
      {props.node.type === 'file' && (
        <>
          <button type="button" title="Download" className={btn} onClick={(e) => { e.stopPropagation(); props.onDownload(); }}>⬇️</button>
          <button type="button" title="Rename" className={btn} onClick={(e) => { e.stopPropagation(); props.onRename(); }}>✏️</button>
        </>
      )}
      <button type="button" title="Move to trash" className={btn} onClick={(e) => { e.stopPropagation(); props.onTrash(); }}>🗑</button>
    </span>
  );
}

function NodeCard(props: NodeActionsProps): React.ReactNode {
  return (
    <div role="button" tabIndex={0} onClick={() => props.node.type === 'folder' && props.onOpen()} onKeyDown={(e) => { if (e.key === 'Enter' && props.node.type === 'folder') props.onOpen(); }} className="group flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-transparent p-3 text-center hover:border-zinc-300 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900">
      <span className="text-3xl" aria-hidden>{props.node.type === 'folder' ? '📁' : fileIcon(props.node.name)}</span>
      <span className="line-clamp-2 w-full break-all text-xs">{props.node.name}</span>
      <span className="text-[10px] text-zinc-400">{props.node.type === 'file' ? formatBytes(props.node.sizeBytes) : ''}</span>
      <ActionButtons {...props} />
    </div>
  );
}

function NodeRow(props: NodeActionsProps): React.ReactNode {
  return (
    <div role="button" tabIndex={0} onClick={() => props.node.type === 'folder' && props.onOpen()} onKeyDown={(e) => { if (e.key === 'Enter' && props.node.type === 'folder') props.onOpen(); }} className="group flex cursor-pointer items-center gap-3 px-2 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
      <span aria-hidden>{props.node.type === 'folder' ? '📁' : fileIcon(props.node.name)}</span>
      <span className="min-w-0 flex-1 truncate">{props.node.name}</span>
      <span className="text-xs text-zinc-400">{props.node.type === 'file' ? formatBytes(props.node.sizeBytes) : ''}</span>
      <ActionButtons {...props} />
    </div>
  );
}

function EmptyState({ showTrash, hasConnections }: { showTrash: boolean; hasConnections: boolean }): React.ReactNode {
  if (showTrash) return <p className="py-16 text-center text-sm text-zinc-400">Trash is empty</p>;
  return (
    <div className="py-16 text-center">
      <p className="text-3xl">☁️</p>
      {hasConnections ? (
        <p className="mt-2 text-sm text-zinc-500">This folder is empty. Drop files anywhere here to upload.</p>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">
          Connect Google Drive or Dropbox in <Link href="/settings" className="text-indigo-600 underline">Settings</Link> to begin.
        </p>
      )}
    </div>
  );
}

// ── utils ────────────────────────────────────────────────────────────────

function capBytes(c: { quotaTotalBytes: number | null; capPct: number }): number {
  return Math.floor(((c.quotaTotalBytes ?? 0) * c.capPct) / 100);
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️';
  if (['mp4', 'mov', 'mkv'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'flac'].includes(ext)) return '🎵';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  return '📄';
}
