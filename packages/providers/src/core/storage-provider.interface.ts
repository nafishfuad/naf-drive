import type { ProviderId } from '@naf/shared';

/** Points at a folder inside a connected provider account. `null` = provider root. */
export interface RemoteFolderRef {
  readonly folderId: string | null;
}

export interface FileEntry {
  readonly remoteId: string;
  readonly name: string;
  readonly isFolder: boolean;
  readonly sizeBytes: number | null;
  readonly mimeType?: string;
  readonly modifiedAt?: string;
}

export interface QuotaInfo {
  readonly totalBytes: number;
  readonly usedBytes: number;
}

export interface ResumableUploadHandle {
  /** Opaque provider session id / upload URL — adapter-scoped, never logged. */
  readonly sessionId: string;
  readonly chunkSizeBytes: number;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
}

export interface ChunkSendResult {
  readonly handle: ResumableUploadHandle;
  /** Present exactly when this chunk completed the upload — provider's file metadata. */
  readonly committed?: FileEntry;
}

/**
 * The single port every cloud adapter implements. Adapters contain ONLY
 * translation logic between this interface and the vendor HTTP API —
 * no NAF business logic is allowed in here.
 *
 * All methods may throw ProviderError subclasses; callers own retry policy.
 */
export interface StorageProvider {
  readonly id: ProviderId;

  listFolder(
    folder: RemoteFolderRef,
    pageToken?: string,
  ): Promise<{ entries: readonly FileEntry[]; nextPageToken?: string }>;

  ensureFolder(parent: RemoteFolderRef, name: string): Promise<RemoteFolderRef>;

  createUploadSession(input: {
    parent: RemoteFolderRef;
    name: string;
    sizeBytes: number;
    mimeType?: string;
  }): Promise<ResumableUploadHandle>;

  /**
   * Sends the chunk at `offsetBytes`. `committed` is set on the final chunk —
   * for Google that chunk IS the commit; Dropbox commits via finalizeUpload().
   */
  uploadChunk(
    handle: ResumableUploadHandle,
    chunk: Uint8Array,
    offsetBytes: number,
  ): Promise<ChunkSendResult>;

  /**
   * Commits a finished session (Dropbox-style). No-op providers whose final
   * chunk already commits may throw UNSUPPORTED or return the stat.
   */
  finalizeUpload(handle: ResumableUploadHandle): Promise<FileEntry>;

  /** Inclusive start, exclusive end. Returns exactly `end - start` bytes on success. */
  downloadRange(remoteId: string, startByte: number, endByteExclusive: number): Promise<Uint8Array>;

  stat(remoteId: string): Promise<FileEntry>;

  remove(remoteId: string): Promise<void>;

  getQuota(): Promise<QuotaInfo>;
}
