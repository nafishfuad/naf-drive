import { z } from 'zod';

import { displayNameSchema, uuidSchema } from './common.schema';

export const nodeTypeEnum = z.enum(['file', 'folder']);

export type NodeType = z.infer<typeof nodeTypeEnum>;

/**
 * Sizes can exceed 2^32 but must stay within JS safe integers until we move
 * byte accounting to bigint columns.
 */
export const fileSizeBytesSchema = z
  .number()
  .int()
  .nonnegative()
  .lte(Number.MAX_SAFE_INTEGER);

export const createFolderInputSchema = z
  .object({
    parentId: uuidSchema.nullable(),
    name: displayNameSchema,
  })
  .strict();

export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;

export const renameNodeInputSchema = z
  .object({
    name: displayNameSchema,
  })
  .strict();

export type RenameNodeInput = z.infer<typeof renameNodeInputSchema>;

export const moveNodeInputSchema = z
  .object({
    parentId: uuidSchema.nullable(),
  })
  .strict();

export type MoveNodeInput = z.infer<typeof moveNodeInputSchema>;

/** Public node shape returned by list/get endpoints. */
export interface NodeDto {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: NodeType;
  readonly sizeBytes: number | null;
  readonly mimeType?: string;
  readonly updatedAt: string;
}
