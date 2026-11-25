import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  label: string
  side?: 'top' | 'bottom'
  disabled?: boolean
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
  disabled = false,
  children,
  className,
}: TooltipProps) {
  return (
    <span className={cn('group/tip relative inline-flex items-center justify-center', className)}>
      {children}
      {!disabled && (
        <span
          role="tooltip"
          data-side={side}
          className={cn(
            't-tt-bubble pointer-events-none absolute left-1/2 z-50 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1 text-[11px] font-medium tracking-tight text-popover-foreground shadow-xl',
            side === 'top' ? 'bottom-full mb-2.5' : 'top-full mt-2.5',
          )}
        >
          {label}
        </span>
      )}
    </span>
  )
}
