import { useMemo } from 'react'
import { ArtworkTile } from '@/components/ArtworkTile'
import { ZunoIcon } from '@/components/ZunoIcon'
import { cn, formatTime } from '@/lib/utils'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface PlaylistsPageProps {
  playlists: Playlist[]
  tracksById: Map<string, Track>
  appearance: AppearanceSettings
  onOpenPlaylist: (slug: string) => void
  onPlayPlaylist: (playlist: Playlist, tracks: Track[]) => void
  onCreatePlaylist: () => void
}

/**
 * Clean Playlists hub page showing Favorites and all custom zero-copy .m3u8 playlists
 * with 1-tap play, track counts, total duration, and New playlist creation.
 */
export function PlaylistsPage({
  playlists,
  tracksById,
  appearance,
  onOpenPlaylist,
  onPlayPlaylist,
  onCreatePlaylist,
}: PlaylistsPageProps) {
  const iconPack = appearance.iconPack

  const ordered = useMemo(() => {
    return [...playlists].sort((a, b) => {
      const aFav = a.slug === 'favorites' || a.slug === 'fav' ? 0 : 1
      const bFav = b.slug === 'favorites' || b.slug === 'fav' ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.title.localeCompare(b.title)
    })
  }, [playlists])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-10 pt-6 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            LIBRARY
          </p>
          <div className="mt-0.5 flex items-baseline gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              Playlists
            </h1>
            {ordered.length > 0 && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {ordered.length}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onCreatePlaylist}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
        >
          <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {ordered.length === 0 ? (
        <div className="z-surface-card flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <ZunoIcon
            name="playlist"
            pack={iconPack}
            className="h-6 w-6 text-muted-foreground/60"
          />
          <p className="text-sm font-medium text-foreground">No playlists yet</p>
          <p className="text-xs text-muted-foreground">
            Create lightweight playlists without duplicating audio files.
          </p>
          <button
            type="button"
            onClick={onCreatePlaylist}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground cursor-pointer"
          >
            <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
            New playlist
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {ordered.map((pl) => {
            const isFav = pl.slug === 'favorites' || pl.slug === 'fav'
            const resolvedTracks = pl.track_ids
              .map((id) => tracksById.get(id))
              .filter((t): t is Track => Boolean(t))
            const totalSecs = resolvedTracks.reduce(
              (acc, t) => acc + (t.duration_secs || 0),
              0,
            )
            const firstTrack = resolvedTracks[0]

            return (
              <div
                key={pl.slug}
                role="button"
                tabIndex={0}
                onClick={() => onOpenPlaylist(pl.slug)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenPlaylist(pl.slug)
                  }
                }}
                className="z-surface-card group flex items-center justify-between gap-3.5 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-secondary/60 cursor-pointer"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div
                    className={cn(
                      'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary',
                    )}
                  >
                    {firstTrack?.has_cover ? (
                      <ArtworkTile
                        trackId={firstTrack.id}
                        hasCover={firstTrack.has_cover}
                        seed={pl.title}
                        variant="thumb"
                      />
                    ) : (
                      <ZunoIcon
                        name={isFav ? 'heart' : 'playlist'}
                        pack={iconPack}
                        filled={isFav}
                        className={cn(
                          'h-5 w-5',
                          isFav ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">
                      {pl.title}
                    </p>
                    <p className="mt-0.5 truncate tabular-nums text-xs text-muted-foreground">
                      {resolvedTracks.length}{' '}
                      {resolvedTracks.length === 1 ? 'song' : 'songs'}
                      {totalSecs > 0 ? ` · ${formatTime(totalSecs)}` : ''}
                    </p>
                  </div>
                </div>

                {resolvedTracks.length > 0 && (
                  <button
                    type="button"
                    aria-label={`Play ${pl.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlayPlaylist(pl, resolvedTracks)
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-primary hover:text-primary-foreground cursor-pointer"
                  >
                    <ZunoIcon
                      name="play"
                      pack={iconPack}
                      filled
                      className="h-3.5 w-3.5 translate-x-[0.5px]"
                    />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
