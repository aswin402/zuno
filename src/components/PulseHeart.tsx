import { useState } from 'react'
import { ZunoIcon } from '@/components/ZunoIcon'
import { cn } from '@/lib/utils'
import type { IconPackId } from '@/lib/appearance'

interface PulseHeartProps {
  liked: boolean
  disabled?: boolean
  iconPack?: IconPackId
  bare?: boolean
  onToggle: () => void
  className?: string
  iconClassName?: string
}

const SPARK_ANGLES = [0, 60, 120, 180, 240, 300]

/**
 * Animated Favorite Heart inspired by @react-bits/PulseHeart-TS-TW:
 * Contracts into a dot, flips fill, springs back with radial burst sparks & halo ring.
 */
export function PulseHeart({
  liked,
  disabled = false,
  iconPack = 'lucide',
  bare = false,
  onToggle,
  className,
  iconClassName,
}: PulseHeartProps) {
  const [burstKey, setBurstKey] = useState(0)

  function handleClick() {
    if (disabled) return
    if (!liked) setBurstKey((k) => k + 1)
    onToggle()
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 cursor-pointer',
        !bare &&
          (liked
            ? 'bg-secondary text-primary'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'),
        className,
      )}
    >
      {/* Expanding radial halo + burst sparks on favorite */}
      {burstKey > 0 && liked && (
        <span
          key={burstKey}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="animate-heart-ring absolute h-5 w-5 rounded-full border border-current" />
          {SPARK_ANGLES.map((deg) => (
            <span
              key={deg}
              style={{ ['--a' as string]: `${deg}deg` }}
              className="animate-heart-spark absolute h-1 w-1 rounded-full bg-current"
            />
          ))}
        </span>
      )}

      <span
        key={liked ? `liked-${burstKey}` : 'idle'}
        className={cn('inline-flex', liked && burstKey > 0 && 'animate-heart-pop')}
      >
        <ZunoIcon
          name="heart"
          pack={iconPack}
          filled={liked}
          className={cn('h-4 w-4', iconClassName)}
        />
      </span>
    </button>
  )
}
