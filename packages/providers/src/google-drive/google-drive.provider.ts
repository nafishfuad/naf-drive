import { ProviderError } from '../core/provider-error';
import type {
  ChunkSendResult,
  FileEntry,
  QuotaInfo,
  RemoteFolderRef,
  ResumableUploadHandle,
} from '../core/storage-provider.interface';
import type { StorageProvider } from '../core/storage-provider.interface';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Google requires chunk sizes that are multiples of 256 KiB (final chunk may be smaller). */
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

interface GDriveHandle extends ResumableUploadHandle {
  readonly uploadUrl: string;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id = 'google-drive' as const;

  constructor(private readonly getAccessToken: () => Promise<string>) {}

  private async request(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) throw await ProviderError.fromResponse(this.id, res);
    return res;
  }

  async listFolder(
    folder: RemoteFolderRef,
    pageToken?: string,
  ): Promise<{ entries: readonly FileEntry[]; nextPageToken?: string }> {
    const parentId = folder.folderId ?? 'root';
    const q = `'${escapeQueryValue(parentId)}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime)',
      pageSize: '200',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await this.request(`${API}/files?${params.toString()}`);
    const json = (await res.json()) as {
      files?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    };

    const entries = (json.files ?? []).map((f) => toFileEntry(f));
    return { entries, nextPageToken: json.nextPageToken };
  }

  async ensureFolder(parent: RemoteFolderRef, name: string): Promise<RemoteFolderRef> {
    const parentId = parent.folderId ?? 'root';
    const q =
      `name = '${escapeQueryValue(name)}' and '${escapeQueryValue(parentId)}' in parents` +
      ` and trashed = false and mimeType = '${FOLDER_MIME}'`;
    const search = await this.request(
      `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    );
    const found = (await search.json()) as { files?: Array<{ id?: string }> };
    const existing = found.files?.[0]?.id;
    if (existing) return { folderId: existing };

    const created = await this.request(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    const json = (await created.json()) as { id: string };
    return { folderId: json.id };
  }

  async createUploadSession(input: {
    parent: RemoteFolderRef;
    name: string;
    sizeBytes: number;
    mimeType?: string;
  }): Promise<GDriveHandle> {
    const metadata: Record<string, unknown> = { name: input.name };
    if (input.parent.folderId) metadata['parents'] = [input.parent.folderId];
    if (input.mimeType) metadata['mimeType'] = input.mimeType;

    const res = await this.request(
      `${UPLOAD_API}/files?uploadType=resumable&fields=id,name,size`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': input.mimeType ?? 'application/octet-stream',
          'X-Upload-Content-Length': String(input.sizeBytes),
        },
        body: JSON.stringify(metadata),
      },
    );

    const uploadUrl = res.headers.get('location');
    if (!uploadUrl) throw new ProviderError(this.id, 502, 'Missing upload session URL');

    return {
      sessionId: uploadUrl,
      uploadUrl,
      chunkSizeBytes: CHUNK_SIZE_BYTES,
      uploadedBytes: 0,
      totalBytes: input.sizeBytes,
    };
  }

  /**
   * Sends one chunk. Google's final chunk (with full Content-Range) commits
   * the file and returns its resource — surfaced via `committed`.
   */
  async uploadChunk(
    handle: ResumableUploadHandle,
    chunk: Uint8Array,
    offsetBytes: number,
  ): Promise<ChunkSendResult> {
    const h = handle as GDriveHandle;
    const start = offsetBytes;
    const end = offsetBytes + chunk.byteLength - 1;
    const isFinal = end + 1 === handle.totalBytes;
    const contentRange = `bytes ${start}-${end}/${handle.totalBytes}`;

    const token = await this.getAccessToken();
    const res = await fetch(h.uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Range': contentRange,
        'Content-Length': String(chunk.byteLength),
      },
      body: chunk as unknown as BodyInit,
    });

    if (res.status === 308) {
      const range = res.headers.get('range');
      const receivedEnd = range ? Number.parseInt(range.split('-')[1] ?? '-1', 10) : -1;
      if (!Number.isFinite(receivedEnd) || receivedEnd + 1 < end + 1) {
        throw new ProviderError(this.id, res.status, 'Chunk offset mismatch during resume');
      }
      return { handle: { ...h, uploadedBytes: receivedEnd + 1 } };
    }

    if (!res.ok) throw await ProviderError.fromResponse(this.id, res);

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const committed: FileEntry = toFileEntry(json);
    return { handle: { ...h, uploadedBytes: handle.totalBytes }, committed };
  }

  /** Google commits on the final chunk — nothing extra to do here. */
  async finalizeUpload(_handle: ResumableUploadHandle): Promise<FileEntry> {
    throw new ProviderError(this.id, 400, 'Google Drive commits on the final chunk');
  }

  async downloadRange(
    remoteId: string,
    startByte: number,
    endByteExclusive: number,
  ): Promise<Uint8Array> {
    const length = endByteExclusive - startByte;
    const res = await this.request(`${API}/files/${remoteId}?alt=media`, {
      headers: { Range: `bytes=${startByte}-${endByteExclusive - 1}` },
    });
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== length) {
      throw new ProviderError(this.id, 502, 'Short read from provider');
    }
    return new Uint8Array(buf);
  }

  async stat(remoteId: string): Promise<FileEntry> {
    const res = await this.request(
      `${API}/files/${remoteId}?fields=id,name,mimeType,size,modifiedTime`,
    );
    return toFileEntry((await res.json()) as Record<string, unknown>);
  }

  async remove(remoteId: string): Promise<void> {
    await this.request(`${API}/files/${remoteId}`, { method: 'DELETE' });
  }

  async getQuota(): Promise<QuotaInfo> {
    const res = await this.request(`${API}/about?fields=storageQuota`);
    const quota = (await res.json()) as { storageQuota?: { limit?: string; usage?: string } };
    return {
      totalBytes: Number(quota.storageQuota?.limit ?? 0),
      usedBytes: Number(quota.storageQuota?.usage ?? 0),
    };
  }
}

function toFileEntry(f: Record<string, unknown>): FileEntry {
  return {
    remoteId: String(f['id']),
    name: String(f['name']),
    isFolder: f['mimeType'] === FOLDER_MIME,
    sizeBytes: f['size'] == null ? null : Number(f['size']),
    mimeType: typeof f['mimeType'] === 'string' ? f['mimeType'] : undefined,
    modifiedAt: typeof f['modifiedTime'] === 'string' ? f['modifiedTime'] : undefined,
  };
}
