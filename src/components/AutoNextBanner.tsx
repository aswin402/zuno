import { SkipForward, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AutoNextBannerProps {
  trackTitle: string
  runId: number
  onUndo: () => void
}

/**
 * Floating @react-bits/FuseButton-TS-TW burning-fuse pill triggered automatically
 * when playback advances to the next track — lets the listener Undo back in 1 click.
 */
export function AutoNextBanner({
  trackTitle,
  runId,
  onUndo,
}: AutoNextBannerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className={cn(
          't-page-enter pointer-events-auto relative flex max-w-sm items-center gap-3 overflow-hidden rounded-full border border-border bg-popover/95 px-4 py-2 text-xs text-popover-foreground shadow-2xl',
        )}
      >
        {/* Burning fuse progress sweep */}
        <span
          key={runId}
          aria-hidden="true"
          className="animate-fuse-burn pointer-events-none absolute inset-0 bg-primary/15"
        />

        <SkipForward className="relative z-10 h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="relative z-10 truncate">
          <span className="text-muted-foreground">Next · </span>
          <span className="font-medium text-foreground">{trackTitle}</span>
        </span>

        <button
          type="button"
          onClick={onUndo}
          className="t-press relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent cursor-pointer"
        >
          <Undo2 className="h-3 w-3 text-primary" />
          Undo
        </button>
      </div>
    </div>
  )
}
