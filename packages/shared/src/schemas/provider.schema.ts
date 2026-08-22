import { z } from 'zod';

export const PROVIDER_IDS = [
  'google-drive',
  'dropbox',
  'onedrive',
  'pcloud',
  'box',
] as const;

export const providerIdSchema = z.enum(PROVIDER_IDS);

export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * Providers planned but not enabled at launch. Kept as plain strings so the
 * enum above stays a closed set of supported adapters.
 */
export const FUTURE_PROVIDER_IDS = ['mega', 's3'] as const;
