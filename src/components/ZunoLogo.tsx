import { cn } from '@/lib/utils'

interface ZunoLogoProps {
  className?: string
}

/**
 * Zuno app emblem: glossy obsidian squircle with a crisp white musical note.
 */
export function ZunoLogo({ className }: ZunoLogoProps) {
  return (
    <img
      src="/icon-192.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('h-5 w-5 shrink-0 select-none object-contain', className)}
    />
  )
}
