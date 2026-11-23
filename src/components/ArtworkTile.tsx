import { cn } from '@/lib/utils'
import { zunoApi } from '@/lib/zunoApi'

interface ArtworkTileProps {
  trackId?: string | null
  hasCover?: boolean
  seed: string
  variant?: 'arch' | 'card' | 'thumb'
  className?: string
}

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Displays real embedded cover art when present, or a refined monochrome zinc
 * architectural motif (strictly 60/30/10 shadcn dark — zero extra colors).
 */
export function ArtworkTile({
  trackId,
  hasCover,
  seed,
  variant = 'card',
  className,
}: ArtworkTileProps) {
  if (trackId && hasCover) {
    return (
      <img
        src={zunoApi.coverUrl(trackId)}
        alt={seed}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }

  const h = hashSeed(seed || 'zuno')
  const cx = 42 + (h % 17)
  const cy = variant === 'arch' ? 54 + ((h >> 4) % 12) : 46 + ((h >> 4) % 12)
  const ringStep = variant === 'thumb' ? 14 : 11

  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-accent/70 via-secondary to-card',
        className,
      )}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full opacity-90"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`g-${h}`} cx={`${cx}%`} cy={`${cy}%`} r="65%">
            <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity="0.28" />
            <stop offset="60%" stopColor="var(--secondary)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--background)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#g-${h})`} />
        {[1, 2, 3, 4].map((i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={i * ringStep}
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.18 - i * 0.03}
            strokeWidth={variant === 'thumb' ? 1 : 0.5}
          />
        ))}
        <circle
          cx={cx}
          cy={cy}
          r={variant === 'thumb' ? 4 : 2.2}
          fill="var(--foreground)"
          fillOpacity="0.55"
        />
      </svg>
    </div>
  )
}
