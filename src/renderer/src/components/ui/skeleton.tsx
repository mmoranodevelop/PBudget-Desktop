import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />
}
