import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as skipping the Supabase JWT guard. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
