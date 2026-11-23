import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { ScrubberKnobStyleId } from '@/lib/appearance'

interface ScrubberProps {
  value: number
  max: number
  styleVariant: ScrubberKnobStyleId
  seed?: string
  compact?: boolean
  interactive?: boolean
  onChange?: (secs: number) => void
  onCommit?: (secs: number) => void
  className?: string
}

function makeWaveHeights(seed: string, count: number): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const bars: number[] = []
  for (let i = 0; i < count; i++) {
    h ^= i * 374761393
    h = Math.imul(h, 668265263)
    const n = (Math.abs(h) % 100) / 100
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
  onChange,
  onCommit,
  className,
}: ScrubberProps) {
  const safeMax = max > 0 ? max : 1
  const clamped = Math.min(Math.max(value, 0), safeMax)
  const pct = (clamped / safeMax) * 100

  const waveCount = compact ? 24 : 44
  const tickCount = compact ? 18 : 34
  const waveBars = useMemo(
    () => makeWaveHeights(seed, waveCount),
    [seed, waveCount],
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
                  played
                    ? 'bg-primary'
                    : 'bg-accent group-hover:bg-muted-foreground/40',
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
                  played ? 'bg-primary' : 'bg-accent',
                )}
              />
            )
          })}
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm transition-transform group-hover:scale-y-115"
            style={{ left: `${pct}%` }}
          />
        </div>
      )}

      {/* 3. Thick Capsule Bar (no protruding knob) */}
      {styleVariant === 'capsule' && (
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-full bg-accent transition-all duration-150',
            compact ? 'h-1.5' : 'h-1.5 group-hover:h-2',
          )}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
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
          <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all',
              styleVariant === 'ring' &&
                'h-3.5 w-3.5 rounded-full border-2 border-primary bg-card shadow-sm group-hover:scale-115',
              styleVariant === 'solid' &&
                'h-3.5 w-3.5 rounded-full bg-primary shadow-sm group-hover:scale-115',
              styleVariant === 'line' &&
                'h-3 w-3 rounded-full bg-primary opacity-0 group-hover:opacity-100',
              styleVariant === 'pill' &&
                'h-4 w-1.5 rounded-full bg-primary shadow-sm group-hover:scale-y-115',
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
