import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  label: string
  side?: 'top' | 'bottom'
  children: React.ReactNode
  className?: string
}

/**
 * Lightweight, theme-aware floating tooltip that always pops UP (or cleanly below
 * near the top edge) — never inline horizontally — and stays hidden on touch taps.
 */
export function Tooltip({
  label,
  side = 'top',
  children,
  className,
}: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline-flex items-center justify-center', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1 text-[11px] font-medium tracking-tight text-popover-foreground opacity-0 shadow-xl transition-all duration-150',
          '[@media(hover:hover)]:group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100',
          side === 'top' &&
            'bottom-full mb-2.5 translate-y-1 [@media(hover:hover)]:group-hover/tip:translate-y-0 group-has-[:focus-visible]/tip:translate-y-0',
          side === 'bottom' &&
            'top-full mt-2.5 -translate-y-1 [@media(hover:hover)]:group-hover/tip:translate-y-0 group-has-[:focus-visible]/tip:translate-y-0',
        )}
      >
        {label}
      </span>
    </span>
  )
}
