/** Absolute site origin used for canonical URLs, sitemap, robots and JSON-LD. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nafdrive.vercel.app'
).replace(/\/$/, '');

export const SITE_NAME = 'NAF Drive';
