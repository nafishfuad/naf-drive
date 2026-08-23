'use client';

import { initUpload, completeUpload, cancelUpload } from '@/lib/api-client';
import { createBrowserAdapter } from './provider-factory';

export interface UploadHandle {
  readonly id: string;
  readonly name: string;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export interface UploadEvents {
  onProgress?: (id: string, uploadedBytes: number, totalBytes: number) => void;
  onDone?: (id: string, nodeId: string) => void;
  onError?: (id: string, message: string) => void;
  onPausedChange?: (id: string, paused: boolean) => void;
}

const CHUNK_PARALLELISM = 3;
const MAX_RETRIES = 4;

interface ActiveJob {
  abort: AbortController;
  paused: boolean;
}

/**
 * Chunked, parallel, resumable uploader. Chunks go browser → provider
 * directly; our API only brokers the initial placement + token.
 */
export class UploadManager {
  private readonly active = new Map<string, ActiveJob>();

  constructor(private readonly events: UploadEvents = {}) {}

  async start(file: File, opts: { parentId: string | null }): Promise<UploadHandle> {
    const init = await initUpload({
      parentId: opts.parentId,
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || undefined,
    });

    const id = init.sessionId;
    const abort = new AbortController();
    const job: ActiveJob = { abort, paused: false };
    this.active.set(id, job);

    void this.run(id, file, init, job).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (!job.abort.signal.aborted) this.events.onError?.(id, message);
    });

    return {
      id,
      name: file.name,
      pause: () => {
        job.paused = true;
        this.events.onPausedChange?.(id, true);
      },
      resume: () => {
        job.paused = false;
        this.events.onPausedChange?.(id, false);
      },
      cancel: () => {
        abort.abort();
        void cancelUpload(id);
        this.active.delete(id);
      },
    };
  }

  private async run(
    id: string,
    file: File,
    init: Awaited<ReturnType<typeof initUpload>>,
    job: ActiveJob,
  ): Promise<void> {
    const adapter = createBrowserAdapter(init.providerId, init.accessToken);
    let handle = await adapter.createUploadSession({
      parent: { folderId: init.remoteRootFolder },
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || undefined,
    });
    if (handle.chunkSizeBytes !== init.chunkSizeBytes) {
      handle = { ...handle, chunkSizeBytes: init.chunkSizeBytes };
    }

    const receivedChunks = new Set<number>();
    const pending: Array<{ index: number; start: number; end: number }> = [];
    for (let start = 0; start < file.size; start += init.chunkSizeBytes) {
      const end = Math.min(start + init.chunkSizeBytes, file.size);
      pending.push({ index: pending.length, start, end });
    }

    let committedEntry: import('@naf/providers').FileEntry | undefined;
    let bytesCompleted = 0;

    const workerErrors: Error[] = [];
    const workers = Array.from({ length: Math.min(CHUNK_PARALLELISM, pending.length) }, async () => {
      while (pending.length > 0 && !job.abort.signal.aborted && workerErrors.length === 0) {
        // Pause gate
        while (job.paused && !job.abort.signal.aborted) {
          await new Promise((r) => setTimeout(r, 300));
        }
        const chunkMeta = pending.shift();
        if (!chunkMeta) break;

        const blobChunk = file.slice(chunkMeta.start, chunkMeta.end);
        let attempt = 0;
        for (;;) {
          attempt += 1;
          try {
            const bytes = new Uint8Array(await blobChunk.arrayBuffer());
            const result = await adapter.uploadChunk(handle, bytes, chunkMeta.start);
            handle = result.handle;
            receivedChunks.add(chunkMeta.index);
            bytesCompleted += chunkMeta.end - chunkMeta.start;
            if (result.committed) committedEntry = result.committed;
            this.events.onProgress?.(id, Math.min(bytesCompleted, file.size), file.size);
            break;
          } catch (err) {
            if (job.abort.signal.aborted) return;
            if (attempt >= MAX_RETRIES) {
              workerErrors.push(err instanceof Error ? err : new Error('chunk failed'));
              break;
            }
            await sleep(Math.min(2 ** attempt * 250, 8000));
          }
        }
      }
    });

    await Promise.all(workers);

    if (workerErrors.length > 0) {
      throw workerErrors[0]!;
    }
    if (job.abort.signal.aborted) return;

    // Dropbox-style providers commit via a final finalize call.
    if (!committedEntry) {
      committedEntry = await adapter.finalizeUpload(handle);
    }

    const remoteFileId = committedEntry.remoteId;
    const { nodeId } = await completeUpload(id, {
      receivedChunks: [...receivedChunks].sort((a, b) => a - b),
      remoteFileId,
      finalSizeBytes: file.size,
    });

    this.active.delete(id);
    this.events.onDone?.(id, nodeId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
