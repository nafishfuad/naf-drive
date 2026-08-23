import { z } from 'zod';

import type { ProviderId } from './provider.schema';

import { displayNameSchema, uuidSchema } from './common.schema';
import { fileSizeBytesSchema } from './node.schema';

/** Phase-1 ceiling per uploaded file. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

const uploadName = displayNameSchema;
const uploadParent = uuidSchema.nullable();
const uploadMime = z.string().max(255).optional();

export const uploadInitRequestSchema = z
  .object({
    parentId: uploadParent,
    name: uploadName,
    sizeBytes: fileSizeBytesSchema.lte(MAX_UPLOAD_BYTES),
    mimeType: uploadMime,
  })
  .strict();

export type UploadInitRequest = z.infer<typeof uploadInitRequestSchema>;

export interface UploadInitResponse {
  readonly providerId: ProviderId;
  readonly sessionId: string;
  readonly nodeId: string;
  /** Provider chunking contract — browser must send chunks of this size (last may be smaller). */
  readonly chunkSizeBytes: number;
  readonly remoteRootFolder: string | null;
  /** Short-lived provider access token minted for direct browser↔provider transfers. */
  readonly accessToken: string;
  readonly tokenExpiresAt: string;
}

export const uploadCompleteRequestSchema = z
  .object({
    receivedChunks: z.array(z.number().int().nonnegative()).max(200_000),
    remoteFileId: z.string().min(1).max(512),
    finalSizeBytes: fileSizeBytesSchema,
  })
  .strict();

export type UploadCompleteRequest = z.infer<typeof uploadCompleteRequestSchema>;

export interface DownloadLocationDto {
  readonly connectionId: string;
  readonly remoteFileId: string;
  readonly sizeBytes: number | null;
}

export interface DownloadTicketResponse {
  readonly node: {
    readonly id: string;
    readonly name: string;
    readonly mimeType?: string;
    readonly sizeBytes: number | null;
  };
  readonly locations: readonly DownloadLocationDto[];
  readonly providerId: ProviderId;
  readonly accessToken: string;
  readonly tokenExpiresAt: string;
}

export interface UploadStatusResponse {
  readonly status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  readonly providerId: ProviderId;
  readonly totalBytes: number;
  readonly chunkSizeBytes: number;
  readonly receivedChunks: readonly number[];
  readonly name: string;
  readonly remoteRootFolder: string | null;
  readonly accessToken: string | null;
  readonly tokenExpiresAt: string | null;
}
