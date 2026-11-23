import { useMemo } from 'react'
import { ChevronLeft, Play, Shuffle, Trash2 } from 'lucide-react'
import { TrackRow } from '@/components/TrackRow'
import { SortControl } from '@/components/SortControl'
import { sortTracks, type SortDir, type SortField } from '@/lib/sortTracks'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface PlaylistPageProps {
  overline: string
  title: string
  tracks: Track[]
  currentTrackId: string | null
  isPlaying: boolean
  progressPct: number
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
  onDeletePlaylist?: () => void
}

export function PlaylistPage({
  overline,
  title,
  tracks,
  currentTrackId,
  isPlaying,
  progressPct,
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
  onDeletePlaylist,
}: PlaylistPageProps) {
  const sortedTracks = useMemo(
    () => sortTracks(tracks, sortField, sortDir),
    [tracks, sortField, sortDir],
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-8 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
            title="Back"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

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
                <Play className="h-3.5 w-3.5 fill-current" />
                Play
              </button>
              <button
                onClick={() => onShuffleAll(sortedTracks)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                title="Shuffle"
                aria-label="Shuffle"
              >
                <Shuffle className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {canDelete && onDeletePlaylist && (
            <button
              onClick={onDeletePlaylist}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              title="Delete playlist"
              aria-label="Delete playlist"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {sortedTracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center text-xs text-muted-foreground">
          No tracks yet. Click + on any song to add it here.
        </div>
      ) : (
        <div className="space-y-1">
          {sortedTracks.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              index={idx}
              active={track.id === currentTrackId}
              isPlaying={isPlaying}
              progressPct={progressPct}
              playlists={playlists}
              appearance={appearance}
              onPlay={() => onPlayTrack(track, sortedTracks)}
              onAddToPlaylist={onAddToPlaylist}
              onCreatePlaylistWithTrack={onCreatePlaylistWithTrack}
              onRemove={
                canRemoveTracks && onRemoveTrack
                  ? () => onRemoveTrack(track.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
