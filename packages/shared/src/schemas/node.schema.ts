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

export const createNodeInputSchema = z
  .object({
    parentId: uuidSchema.nullable(),
    name: displayNameSchema,
    type: nodeTypeEnum,
    mimeType: z.string().max(255).optional(),
    sizeBytes: fileSizeBytesSchema.optional(),
  })
  .strict();

export type CreateNodeInput = z.infer<typeof createNodeInputSchema>;
