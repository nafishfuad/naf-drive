import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-zinc-300 bg-transparent px-3 text-sm placeholder:text-zinc-400',
        'dark:border-zinc-700 dark:placeholder:text-zinc-600',
        className,
      )}
      {...props}
    />
  );
}
