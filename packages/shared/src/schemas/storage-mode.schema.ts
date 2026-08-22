import { z } from 'zod';

export const STORAGE_MODES = ['STANDARD', 'VAULT'] as const;
export const storageModeSchema = z.enum(STORAGE_MODES);

export type StorageMode = (typeof STORAGE_MODES)[number];

/**
 * STANDARD (default): no client-side encryption. Files are stored as-is in the
 * user's own provider drives with real names; file bytes never pass through
 * our servers (direct browser↔provider transfers).
 *
 * VAULT (opt-in): a user-held passphrase wraps the master key (Argon2id);
 * file contents AND provider-side filenames are encrypted in the browser.
 * Recovery phrase issued at enable time — lost phrase + passphrase means the
 * data is unrecoverable by anyone, by design.
 */
export const DEFAULT_STORAGE_MODE: StorageMode = 'STANDARD';
