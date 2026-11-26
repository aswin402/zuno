import { memo, useEffect, useState } from 'react'
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
 * Default fallback music thumbnail: Zuno's classic four stepped pure-white
 * acoustic bars forming a Play silhouette on an obsidian tile.
 */
export function DefaultMusicCover({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn('h-full w-full select-none', className)}
    >
      <rect width="512" height="512" fill="#09090b" />
      <g fill="#fafafa">
        <rect x="148" y="140" width="38" height="232" rx="19" />
        <rect x="214" y="170" width="38" height="172" rx="19" />
        <rect x="280" y="201" width="38" height="110" rx="19" />
        <rect x="346" y="232" width="38" height="48" rx="19" />
      </g>
    </svg>
  )
}

/**
 * Displays cached embedded cover art (96px thumbnails for lists, full-res for Now Playing)
 * with lazy async decoding, or Zuno's classic four-bar default music thumbnail when absent.
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

  return <DefaultMusicCover className={className} />
})
