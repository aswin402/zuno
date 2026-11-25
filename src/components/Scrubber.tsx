import { useMemo } from 'react'
import { fnv1aHash } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ScrubberKnobStyleId } from '@/lib/appearance'

interface ScrubberProps {
  value: number
  max: number
  styleVariant: ScrubberKnobStyleId
  seed?: string
  compact?: boolean
  interactive?: boolean
  /** Contrast tone: 'default' on card surfaces, 'surface' on background trays, 'inverted' on light-mode dark trays. */
  tone?: 'default' | 'surface' | 'inverted'
  onChange?: (secs: number) => void
  onCommit?: (secs: number) => void
  className?: string
}

function makeWaveHeights(seed: string, count: number): number[] {
  let h = fnv1aHash(seed) | 0
  const bars: number[] = []
  for (let i = 0; i < count; i++) {
    h ^= i * 374761393
    h = Math.imul(h, 668265263)
    const n = ((h >>> 0) % 100) / 100
    // Gentle musical envelope (taller in center, organic peaks)
    const env = 0.45 + 0.55 * Math.sin(((i + 1) / (count + 1)) * Math.PI)
    bars.push(Math.round(24 + n * env * 76))
  }
  return bars
}

/**
 * Multi-style playback progress scrubber supporting 7 minimal theme-aware styles:
 * ring, solid, line, pill, capsule, waveform, and ticks.
 */
export function Scrubber({
  value,
  max,
  styleVariant,
  seed = 'zuno',
  compact = false,
  interactive = true,
  tone = 'default',
  onChange,
  onCommit,
  className,
}: ScrubberProps) {
  const safeMax = max > 0 ? max : 1
  const clamped = Math.min(Math.max(value, 0), safeMax)
  const pct = (clamped / safeMax) * 100
  const isInverted = tone === 'inverted'
  const playedBg = isInverted ? 'bg-background' : 'bg-primary'
  const trackBg = isInverted ? 'bg-background/25' : 'bg-accent'
  const trackHoverBg = isInverted
    ? 'group-hover:bg-background/45'
    : 'group-hover:bg-muted-foreground/40'
  const ringBg = isInverted
    ? 'border-background bg-foreground'
    : tone === 'surface'
      ? 'border-primary bg-background'
      : 'border-primary bg-card'

  const waveCount = compact ? 24 : 44
  const tickCount = compact ? 18 : 34
  const waveBars = useMemo(
    () => (styleVariant === 'waveform' ? makeWaveHeights(seed, waveCount) : []),
    [styleVariant, seed, waveCount],
  )

  return (
    <div
      className={cn(
        'relative flex w-full items-center group select-none',
        compact ? 'h-5' : 'h-6',
        className,
      )}
    >
      {/* 1. Waveform Bars Scrubber */}
      {styleVariant === 'waveform' && (
        <div className="relative flex h-full w-full items-center justify-between gap-[2px]">
          {waveBars.map((hPct, i) => {
            const barPct = ((i + 0.5) / waveBars.length) * 100
            const played = barPct <= pct
            return (
              <span
                key={i}
                style={{ height: `${hPct}%` }}
                className={cn(
                  'w-[2px] flex-1 max-w-[3px] rounded-full transition-colors duration-100',
                  played ? playedBg : cn(trackBg, trackHoverBg),
                )}
              />
            )
          })}
        </div>
      )}

      {/* 2. Segmented Ticks Scrubber */}
      {styleVariant === 'ticks' && (
        <div className="relative flex h-full w-full items-center justify-between">
          {Array.from({ length: tickCount }).map((_, i) => {
            const tickPct = (i / (tickCount - 1)) * 100
            const played = tickPct <= pct
            const isMajor = i % 4 === 0
            return (
              <span
                key={i}
                className={cn(
                  'w-[1.5px] rounded-full transition-colors duration-100',
                  isMajor ? (compact ? 'h-2.5' : 'h-3') : compact ? 'h-1.5' : 'h-2',
                  played ? playedBg : trackBg,
                )}
              />
            )
          })}
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 h-4 w-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm transition-transform group-hover:scale-y-115',
              playedBg,
            )}
            style={{ left: `${pct}%` }}
          />
        </div>
      )}

      {/* 3. Thick Capsule Bar (no protruding knob) */}
      {styleVariant === 'capsule' && (
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-full transition-all duration-150',
            trackBg,
            compact ? 'h-1.5' : 'h-1.5 group-hover:h-2',
          )}
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-75', playedBg)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* 4. Classic Hairline Rail Variants: ring | solid | line | pill */}
      {(styleVariant === 'ring' ||
        styleVariant === 'solid' ||
        styleVariant === 'line' ||
        styleVariant === 'pill') && (
        <>
          <div className={cn('relative h-[2px] w-full overflow-hidden rounded-full', trackBg)}>
            <div
              className={cn('h-full rounded-full transition-[width] duration-75', playedBg)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all',
              styleVariant === 'ring' &&
                cn('h-3.5 w-3.5 rounded-full border-2 shadow-sm group-hover:scale-115', ringBg),
              styleVariant === 'solid' &&
                cn('h-3.5 w-3.5 rounded-full shadow-sm group-hover:scale-115', playedBg),
              styleVariant === 'line' &&
                cn('h-3 w-3 rounded-full opacity-0 group-hover:opacity-100', playedBg),
              styleVariant === 'pill' &&
                cn('h-4 w-1.5 rounded-full shadow-sm group-hover:scale-y-115', playedBg),
            )}
            style={{ left: `${pct}%` }}
          />
        </>
      )}

      {interactive && (
        <input
          type="range"
          aria-label="Playback position"
          min={0}
          max={safeMax}
          step={0.1}
          value={clamped}
          onChange={(e) => onChange?.(Number(e.target.value))}
          onMouseUp={(e) =>
            onCommit?.(Number((e.target as HTMLInputElement).value))
          }
          onTouchEnd={(e) =>
            onCommit?.(Number((e.target as HTMLInputElement).value))
          }
          onKeyUp={(e) =>
            onCommit?.(Number((e.target as HTMLInputElement).value))
          }
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      )}
    </div>
  )
}
