import { memo, useEffect, useState } from 'react'
import { fnv1aHash } from '@/lib/format'
import { cn } from '@/lib/utils'
import { zunoApi } from '@/lib/zunoApi'

interface ArtworkTileProps {
  trackId?: string | null
  hasCover?: boolean
  seed: string
  variant?: 'arch' | 'card' | 'thumb'
  className?: string
}

/**
 * Displays cached embedded cover art (96px thumbnails for lists, full-res for Now Playing)
 * with lazy async decoding, or a lightweight monochrome architectural fallback.
 */
export const ArtworkTile = memo(function ArtworkTile({
  trackId,
  hasCover,
  seed,
  variant = 'card',
  className,
}: ArtworkTileProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [trackId])

  if (trackId && hasCover && !failed) {
    const thumbSize = variant === 'thumb' ? 96 : variant === 'card' ? 256 : undefined
    return (
      <img
        src={zunoApi.coverUrl(trackId, thumbSize)}
        alt={seed}
        loading={variant === 'arch' ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }

  const h = fnv1aHash(seed || 'zuno')
  const cx = 42 + (h % 17)
  const cy = variant === 'arch' ? 54 + ((h >> 4) % 12) : 46 + ((h >> 4) % 12)

  // Ultra-fast pure CSS fallback for small list thumbnails (avoids per-row SVG gradients)
  if (variant === 'thumb') {
    return (
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden bg-secondary',
          className,
        )}
        style={{
          backgroundImage: `radial-gradient(circle at ${cx}% ${cy}%, color-mix(in srgb, var(--foreground) 16%, transparent) 0%, transparent 65%)`,
        }}
        aria-hidden="true"
      >
        <span className="h-5 w-5 rounded-full border border-foreground/15 flex items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground/45" />
        </span>
      </div>
    )
  }

  const ringStep = 11

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
            strokeWidth={0.5}
          />
        ))}
        <circle cx={cx} cy={cy} r={2.2} fill="var(--foreground)" fillOpacity="0.55" />
      </svg>
    </div>
  )
})
