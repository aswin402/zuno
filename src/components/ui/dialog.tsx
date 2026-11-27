import * as React from 'react'
import { X } from 'lucide-react'
import { prefersReducedMotion } from '@/lib/format'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: DialogProps) {
  const [mounted, setMounted] = React.useState(open)
  const [phase, setPhase] = React.useState<'enter' | 'open' | 'closing'>(
    open ? 'open' : 'enter',
  )
  const lastSubtitleRef = React.useRef<string | undefined>(subtitle)
  if (open) {
    lastSubtitleRef.current = subtitle
  }
  const displaySubtitle = open ? subtitle : lastSubtitleRef.current

  React.useEffect(() => {
    if (open) {
      setMounted(true)
      setPhase('enter')
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setPhase('open'))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    if (!mounted) return
    setPhase('closing')
    const closeMs = prefersReducedMotion() ? 0 : 165
    const timer = window.setTimeout(() => setMounted(false), closeMs)
    return () => window.clearTimeout(timer)
  }, [open, mounted])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div
      className={cn(
        't-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]',
        phase === 'open' && 'is-open',
        phase === 'closing' && 'is-closing pointer-events-none',
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          't-modal flex max-h-[calc(100dvh-2rem-var(--zuno-safe-top)-var(--zuno-safe-bottom))] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl',
          phase === 'open' && 'is-open',
          phase === 'closing' && 'is-closing',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {displaySubtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{displaySubtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="t-press rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
