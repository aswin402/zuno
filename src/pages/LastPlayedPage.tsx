import { memo, useCallback } from 'react'
import { Clock } from 'lucide-react'
import { TrackRow } from '@/components/TrackRow'
import { Tooltip } from '@/components/ui/tooltip'
import { ZunoIcon } from '@/components/ZunoIcon'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface LastPlayedPageProps {
  tracks: Track[]
  playlists: Playlist[]
  currentTrackId: string | null
  isPlaying: boolean
  appearance: AppearanceSettings
  onPlayTrack: (track: Track, subset: Track[]) => void
  onPlayAll: (subset: Track[]) => void
  onRemoveTrack: (trackId: string) => void
  onClearAll: () => void
  onAddToPlaylist: (slug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId?: string) => void
}

/**
 * Dedicated Last Played history page showing recently listened songs with 1-click play,
 * three-dots playlist/remove actions, and Clear history.
 */
export const LastPlayedPage = memo(function LastPlayedPage({
  tracks,
  playlists,
  currentTrackId,
  isPlaying,
  appearance,
  onPlayTrack,
  onPlayAll,
  onRemoveTrack,
  onClearAll,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
}: LastPlayedPageProps) {
  const iconPack = appearance.iconPack

  const handlePlayRow = useCallback(
    (track: Track) => {
      onPlayTrack(track, tracks)
    },
    [onPlayTrack, tracks],
  )

  const handleDeleteRow = useCallback(
    (track: Track) => {
      onRemoveTrack(track.id)
    },
    [onRemoveTrack],
  )

  const handleCreatePlaylistWithTrack = useCallback(
    (tid: string) => {
      onCreatePlaylistWithTrack(tid)
    },
    [onCreatePlaylistWithTrack],
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-10 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            HISTORY
          </p>
          <div className="mt-0.5 flex items-baseline gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              Last Played
            </h1>
            {tracks.length > 0 && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {tracks.length}
              </span>
            )}
          </div>
        </div>

        {tracks.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPlayAll(tracks)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
            >
              <ZunoIcon name="play" pack={iconPack} filled className="h-3.5 w-3.5" />
              Play all
            </button>

            <Tooltip label="Clear history" side="bottom">
              <button
                type="button"
                onClick={onClearAll}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                aria-label="Clear history"
              >
                <ZunoIcon name="trash" pack={iconPack} className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {tracks.length === 0 ? (
        <div className="z-surface-card flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Clock className="h-6 w-6 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">No recent songs yet</p>
          <p className="text-xs text-muted-foreground">
            Songs you listen to will show up here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {tracks.map((track, idx) => {
            const active = track.id === currentTrackId
            return (
              <TrackRow
                key={track.id}
                track={track}
                index={idx}
                active={active}
                isPlaying={active && isPlaying}
                playlists={playlists}
                appearance={appearance}
                deleteLabel="Remove from recent"
                onPlay={handlePlayRow}
                onAddToPlaylist={onAddToPlaylist}
                onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
                onDelete={handleDeleteRow}
              />
            )
          })}
        </div>
      )}
    </div>
  )
})
