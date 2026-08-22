import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const isoDateTimeSchema = z.string().datetime();

export const displayNameSchema = z.string().trim().min(1).max(255);

export const paginationSchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;
