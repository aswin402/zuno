import { cn } from '@/lib/utils'

interface WaveformPlayButtonProps {
  isPlaying: boolean
  onClick: () => void
  size?: 'sm' | 'md' | 'lg'
  inverted?: boolean
  className?: string
}

/**
 * Interactive waveform Play/Pause toggle button inspired by @skiper-ui/skiper25:
 * Smoothly shifts between calm silent bars and dancing staggered audio waveform bars.
 */
export function WaveformPlayButton({
  isPlaying,
  onClick,
  size = 'md',
  inverted = false,
  className,
}: WaveformPlayButtonProps) {
  const barColor = inverted ? 'bg-primary-foreground' : 'bg-primary'
  const dimBarColor = inverted ? 'bg-primary-foreground/60' : 'bg-foreground/75'
  const heightCls = size === 'lg' ? 'h-5' : size === 'sm' ? 'h-3.5' : 'h-4'
  const btnSizeCls =
    size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-9 w-9' : 'h-9 w-9'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'relative flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer',
        btnSizeCls,
        inverted
          ? 'bg-primary text-primary-foreground shadow-md'
          : 'bg-secondary/80 text-foreground hover:bg-secondary',
        className,
      )}
    >
      <span className={cn('flex items-center gap-[2.5px]', heightCls)}>
        {[
          { cls: 'animate-wave-1', rest: 'h-[35%]' },
          { cls: 'animate-wave-2', rest: 'h-[60%]' },
          { cls: 'animate-wave-3', rest: 'h-[95%]' },
          { cls: 'animate-wave-4', rest: 'h-[55%]' },
          { cls: 'animate-wave-5', rest: 'h-[32%]' },
        ].map((bar, idx) => (
          <span
            key={idx}
            className={cn(
              'w-[2.5px] rounded-full transition-all duration-200 origin-center',
              isPlaying ? cn('h-full', barColor, bar.cls) : cn(bar.rest, dimBarColor),
            )}
          />
        ))}
      </span>
    </button>
  )
}

/**
 * Spinning Vinyl Record Play/Pause toggle button inspired by @skiper-ui/skiper25:
 * Spins smoothly while playing and pauses gracefully with a crisp center spindle/play mark.
 */
export function VinylPlayButton({
  isPlaying,
  onClick,
  size = 'md',
  inverted = false,
  className,
}: WaveformPlayButtonProps) {
  const btnSizeCls =
    size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-9 w-9' : 'h-9 w-9'
  const svgSizeCls =
    size === 'lg' ? 'h-11 w-11' : size === 'sm' ? 'h-8 w-8' : 'h-8 w-8'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'relative flex items-center justify-center rounded-full transition-transform active:scale-95 cursor-pointer',
        btnSizeCls,
        inverted ? 'text-primary-foreground' : 'text-foreground',
        className,
      )}
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
        className={cn(
          svgSizeCls,
          isPlaying ? 'animate-vinyl-spin' : 'animate-vinyl-paused',
        )}
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="16.5"
          fill={inverted ? 'currentColor' : 'var(--secondary)'}
          fillOpacity={inverted ? 0.16 : 1}
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="1.2"
        />
        <circle
          cx="18"
          cy="18"
          r="12.5"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="1"
          strokeDasharray="16 8"
        />
        <circle
          cx="18"
          cy="18"
          r="9"
          stroke="currentColor"
          strokeOpacity="0.26"
          strokeWidth="1"
          strokeDasharray="10 6"
        />
        <circle
          cx="18"
          cy="18"
          r="5"
          fill={inverted ? 'currentColor' : 'var(--primary)'}
          fillOpacity={inverted ? 0.92 : 1}
        />
        <circle
          cx="18"
          cy="18"
          r="1.6"
          fill={inverted ? 'var(--primary)' : 'var(--primary-foreground)'}
        />
      </svg>

      {!isPlaying && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3 translate-x-[0.5px] drop-shadow-xs"
            fill={inverted ? 'var(--primary)' : 'var(--primary-foreground)'}
            aria-hidden="true"
          >
            <path d="M5 3.6l7.5 4.4L5 12.4V3.6z" />
          </svg>
        </span>
      )}
    </button>
  )
}
