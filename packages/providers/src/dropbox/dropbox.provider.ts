import { ProviderError } from '../core/provider-error';
import type {
  ChunkSendResult,
  FileEntry,
  QuotaInfo,
  RemoteFolderRef,
  ResumableUploadHandle,
} from '../core/storage-provider.interface';
import type { StorageProvider } from '../core/storage-provider.interface';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

interface DbxHandle extends ResumableUploadHandle {
  /** Absolute Dropbox path the file will be committed to. */
  readonly commitPath: string;
}

export class DropboxProvider implements StorageProvider {
  readonly id = 'dropbox' as const;

  constructor(private readonly getAccessToken: () => Promise<string>) {}

  private async request<T>(url: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await ProviderError.fromResponse(this.id, res);
    return (await res.json()) as T;
  }

  private async contentRequest(
    apiArg: Record<string, unknown>,
    body?: BodyInit,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const token = await this.getAccessToken();
    const res = await fetch(CONTENT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify(apiArg),
        ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
        ...extraHeaders,
      },
      body,
    });
    if (!res.ok) throw await ProviderError.fromResponse(this.id, res);
    return res;
  }

  private static toEntry(e: Record<string, unknown>): FileEntry {
    const isFolder = e['.tag'] === 'folder';
    return {
      remoteId: String(e['id']),
      name: String(e['name']),
      isFolder,
      sizeBytes: isFolder ? null : Number(e['size'] ?? 0),
      modifiedAt:
        typeof e['server_modified'] === 'string' ? (e['server_modified'] as string) : undefined,
    };
  }

  async listFolder(
    folder: RemoteFolderRef,
    pageToken?: string,
  ): Promise<{ entries: readonly FileEntry[]; nextPageToken?: string }> {
    const path = folder.folderId ?? '';

    if (pageToken) {
      const json = await this.request<{
        entries: Array<Record<string, unknown>>;
        has_more: boolean;
        cursor: string;
      }>(`${API}/files/list_folder/continue`, { cursor: pageToken });
      return {
        entries: json.entries.map(DropboxProvider.toEntry),
        nextPageToken: json.has_more ? json.cursor : undefined,
      };
    }

    const first = await this.request<{
      entries: Array<Record<string, unknown>>;
      has_more: boolean;
      cursor: string;
    }>(`${API}/files/list_folder`, {
      path,
      recursive: false,
      include_deleted: false,
      limit: 500,
    });

    const all = [...first.entries];
    let cursor = first.cursor;
    while (first.has_more && all.length < 2000) {
      const next = await this.request<{
        entries: Array<Record<string, unknown>>;
        has_more: boolean;
        cursor: string;
      }>(`${API}/files/list_folder/continue`, { cursor });
      all.push(...next.entries);
      cursor = next.cursor;
      if (!next.has_more) break;
    }

    return { entries: all.map(DropboxProvider.toEntry), nextPageToken: cursor };
  }

  async ensureFolder(parent: RemoteFolderRef, name: string): Promise<RemoteFolderRef> {
    const parentPath = parent.folderId ?? '';
    const full = `${parentPath}/${name}`.replace('//', '/');
    const created = await this.request<{ metadata: Record<string, unknown> }>(
      `${API}/files/create_folder_v2`,
      { path: full, autorename: false },
    );
    return { folderId: String(created.metadata['id']) };
  }

  async createUploadSession(input: {
    parent: RemoteFolderRef;
    name: string;
    sizeBytes: number;
    mimeType?: string;
  }): Promise<DbxHandle> {
    const parentPath = input.parent.folderId ?? '';
    const commitPath = `${parentPath}/${input.name}`.replace('//', '/');

    const res = await this.contentRequest({ close: false }, new Uint8Array(0));
    const json = (await res.json()) as { session_id: string };

    return {
      sessionId: json.session_id,
      chunkSizeBytes: CHUNK_SIZE_BYTES,
      uploadedBytes: 0,
      totalBytes: input.sizeBytes,
      commitPath,
    };
  }

  /**
   * Appends one chunk; when it is the last we close the session here and
   * commit on finalizeUpload() so partial failures never half-commit.
   */
  async uploadChunk(
    handle: ResumableUploadHandle,
    chunk: Uint8Array,
    offsetBytes: number,
  ): Promise<ChunkSendResult> {
    const h = handle as DbxHandle;
    const isLast = offsetBytes + chunk.byteLength === handle.totalBytes;

    const res = await this.contentRequest(
      { cursor: { session_id: handle.sessionId, offset: offsetBytes }, close: isLast },
      chunk as unknown as BodyInit,
    );
    if (!res.ok) throw await ProviderError.fromResponse(this.id, res);

    return { handle: { ...h, uploadedBytes: offsetBytes + chunk.byteLength } };
  }

  async finalizeUpload(handle: ResumableUploadHandle): Promise<FileEntry> {
    const h = handle as DbxHandle;
    const res = await this.contentRequest({
      cursor: { session_id: handle.sessionId, offset: handle.totalBytes },
      commit: { path: h.commitPath, mode: { '.tag': 'add' }, autorename: false },
    });
    const json = (await res.json()) as Record<string, unknown>;
    return DropboxProvider.toEntry(json);
  }

  async downloadRange(
    remoteId: string,
    startByte: number,
    endByteExclusive: number,
  ): Promise<Uint8Array> {
    const length = endByteExclusive - startByte;
    // Dropbox accepts `id:` prefixed paths wherever a path is expected.
    const res = await this.contentRequest(
      { path: remoteId.startsWith('id:') ? remoteId : `id:${remoteId}` },
      undefined,
      { Range: `bytes=${startByte}-${endByteExclusive - 1}` },
    );
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== length) {
      throw new ProviderError(this.id, 502, 'Short read from provider');
    }
    return new Uint8Array(buf);
  }

  async stat(remoteId: string): Promise<FileEntry> {
    const entry = await this.request<Record<string, unknown>>(`${API}/files/get_metadata`, {
      path: remoteId.startsWith('id:') ? remoteId : `id:${remoteId}`,
      include_deleted: false,
    });
    return DropboxProvider.toEntry(entry);
  }

  async remove(remoteId: string): Promise<void> {
    await this.request(`${API}/files/delete_v2`, {
      path: remoteId.startsWith('id:') ? remoteId : `id:${remoteId}`,
    });
  }

  async getQuota(): Promise<QuotaInfo> {
    const json = await this.request<{
      used: number;
      allocation: { allocated: number | { allocated: number } };
    }>(`${API}/users/get_space_usage`, {});
    const allocated = json.allocation;
    const total =
      typeof allocated === 'number'
        ? allocated
        : Number((allocated as { allocated: number }).allocated ?? 0);
    return { totalBytes: total, usedBytes: Number(json.used) };
  }
}
