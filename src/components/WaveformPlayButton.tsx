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
        'relative flex items-center justify-center rounded-full transition-colors cursor-pointer',
        btnSizeCls,
        inverted
          ? 'bg-primary text-primary-foreground shadow-md active:scale-95'
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
