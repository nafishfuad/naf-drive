'use client';

import {
  DropboxProvider,
  GoogleDriveProvider,
  type StorageProvider,
} from '@naf/providers';

import type { ProviderId } from '@naf/shared';

/**
 * Builds the SAME adapters the server uses, but bound to a short-lived token
 * minted by our API — this is what makes browser↔provider direct transfers
 * possible with zero bytes flowing through NAF infrastructure.
 */
export function createBrowserAdapter(providerId: ProviderId, accessToken: string): StorageProvider {
  const getToken = (): Promise<string> => Promise.resolve(accessToken);
  return providerId === 'google-drive'
    ? new GoogleDriveProvider(getToken)
    : new DropboxProvider(getToken);
}
