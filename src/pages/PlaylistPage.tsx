import { memo, useCallback, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { TrackRow } from '@/components/TrackRow'
import { SortControl } from '@/components/SortControl'
import { VirtualTrackList } from '@/components/VirtualTrackList'
import { Tooltip } from '@/components/ui/tooltip'
import { ZunoIcon } from '@/components/ZunoIcon'
import { sortTracks, type SortDir, type SortField } from '@/lib/sortTracks'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface PlaylistPageProps {
  overline: string
  title: string
  tracks: Track[]
  currentTrackId: string | null
  isPlaying: boolean
  playlists: Playlist[]
  sortField: SortField
  sortDir: SortDir
  appearance: AppearanceSettings
  allowDefaultSort?: boolean
  canDelete?: boolean
  canRemoveTracks?: boolean
  onSortChange: (field: SortField, dir: SortDir) => void
  onBack: () => void
  onPlayTrack: (track: Track, orderedTracks: Track[]) => void
  onPlayAll: (orderedTracks: Track[]) => void
  onShuffleAll: (orderedTracks: Track[]) => void
  onAddToPlaylist: (slug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId?: string) => void
  onRemoveTrack?: (trackId: string) => void
  onDeleteTrack: (track: Track) => void
  onDeletePlaylist?: () => void
}

function estimateTrackRowHeight(a: AppearanceSettings): number {
  const base = a.density === 'compact' ? 50 : a.density === 'spacious' ? 68 : 60
  return a.showTrackOverline ? base : base - 8
}

export const PlaylistPage = memo(function PlaylistPage({
  overline,
  title,
  tracks,
  currentTrackId,
  isPlaying,
  playlists,
  sortField,
  sortDir,
  appearance,
  allowDefaultSort = false,
  canDelete = false,
  canRemoveTracks = false,
  onSortChange,
  onBack,
  onPlayTrack,
  onPlayAll,
  onShuffleAll,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
  onRemoveTrack,
  onDeleteTrack,
  onDeletePlaylist,
}: PlaylistPageProps) {
  const sortedTracks = useMemo(
    () => sortTracks(tracks, sortField, sortDir),
    [tracks, sortField, sortDir],
  )
  const iconPack = appearance.iconPack

  const handlePlayRow = useCallback(
    (track: Track) => {
      onPlayTrack(track, sortedTracks)
    },
    [onPlayTrack, sortedTracks],
  )

  const handleDeleteRow = useCallback(
    (track: Track) => {
      if (canRemoveTracks && onRemoveTrack) {
        onRemoveTrack(track.id)
      } else {
        onDeleteTrack(track)
      }
    },
    [canRemoveTracks, onRemoveTrack, onDeleteTrack],
  )

  const handleCreatePlaylistWithTrack = useCallback(
    (tid: string) => {
      onCreatePlaylistWithTrack(tid)
    },
    [onCreatePlaylistWithTrack],
  )

  const rowHeight = estimateTrackRowHeight(appearance)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-8 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Tooltip label="Back" side="bottom">
            <button
              onClick={onBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>

          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {overline}
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {sortedTracks.length > 0 && (
            <>
              <SortControl
                field={sortField}
                dir={sortDir}
                allowDefault={allowDefaultSort}
                onChange={onSortChange}
              />
              <button
                onClick={() => onPlayAll(sortedTracks)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
              >
                <ZunoIcon name="play" pack={iconPack} filled className="h-3.5 w-3.5" />
                Play
              </button>
              <Tooltip label="Shuffle" side="top">
                <button
                  onClick={() => onShuffleAll(sortedTracks)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  aria-label="Shuffle"
                >
                  <ZunoIcon name="shuffle" pack={iconPack} className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </>
          )}
          {canDelete && onDeletePlaylist && (
            <Tooltip label="Delete playlist" side="top">
              <button
                onClick={onDeletePlaylist}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                aria-label="Delete playlist"
              >
                <ZunoIcon name="trash" pack={iconPack} className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {sortedTracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center text-xs text-muted-foreground">
          No tracks yet. Click ··· on any song to add it here.
        </div>
      ) : (
        <VirtualTrackList
          items={sortedTracks}
          getKey={(t) => t.id}
          estimateRowHeight={rowHeight}
          renderItem={(track, idx) => {
            const active = track.id === currentTrackId
            return (
              <TrackRow
                track={track}
                index={idx}
                active={active}
                isPlaying={active && isPlaying}
                playlists={playlists}
                appearance={appearance}
                deleteLabel={canRemoveTracks ? 'Remove from playlist' : 'Delete'}
                onPlay={handlePlayRow}
                onAddToPlaylist={onAddToPlaylist}
                onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
                onDelete={handleDeleteRow}
              />
            )
          }}
        />
      )}
    </div>
  )
})
