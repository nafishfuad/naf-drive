'use client';

import { getDownloadTicket } from '@/lib/api-client';
import { createBrowserAdapter } from './provider-factory';

const RANGE_PARALLELISM = 4;
const RANGE_BYTES = 8 * 1024 * 1024;

/**
 * Streams a file from the provider straight into a Blob using parallel HTTP
 * Range requests — then hands it to the browser's save flow. Bytes never
 * pass through NAF servers.
 */
export async function downloadFile(nodeId: string): Promise<void> {
  const ticket = await getDownloadTicket(nodeId);
  if (ticket.locations.length === 0) throw new Error('No healthy copy available');

  const total = ticket.node.sizeBytes ?? ticket.locations[0]!.sizeBytes ?? 0;
  const adapter = createBrowserAdapter(ticket.providerId, ticket.accessToken);
  const location = ticket.locations[0]!;
  const remoteId = location.remoteFileId;

  // Build the full byte map (files are capped at 10 GB in Phase 1; typical
  // files stream in a handful of ranges).
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < total; start += RANGE_BYTES) {
    ranges.push({ start, end: Math.min(start + RANGE_BYTES, total) });
  }

  const parts = new Array<Uint8Array>(ranges.length);
  let cursor = 0;
  const errors: Error[] = [];

  async function worker(): Promise<void> {
    while (cursor < ranges.length && errors.length === 0) {
      const index = cursor++;
      const range = ranges[index]!;
      try {
        parts[index] = await adapter.downloadRange(remoteId, range.start, range.end);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error('range fetch failed'));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(RANGE_PARALLELISM, ranges.length) }, worker));
  if (errors.length > 0) throw errors[0]!;

  const blob = new Blob(parts as BlobPart[], {
    type: ticket.node.mimeType ?? 'application/octet-stream',
  });
  saveBlob(blob, ticket.node.name);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
