import { memo, useCallback, useMemo } from 'react'
import { TrackRow } from '@/components/TrackRow'
import { SortControl } from '@/components/SortControl'
import { VirtualTrackList } from '@/components/VirtualTrackList'
import { ZunoIcon } from '@/components/ZunoIcon'
import { estimateTrackRowHeight } from '@/lib/format'
import { sortTracks, type SortDir, type SortField } from '@/lib/sortTracks'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface HomePageProps {
  tracks: Track[]
  playlists: Playlist[]
  sourceCount: number
  currentTrackId: string | null
  isPlaying: boolean
  sortField: SortField
  sortDir: SortDir
  appearance: AppearanceSettings
  onSortChange: (field: SortField, dir: SortDir) => void
  onPlayAll: (subset?: Track[]) => void
  onOpenFolders: () => void
  onPlayTrack: (track: Track, subset: Track[], label: string, sourceKey: string) => void
  onDeleteTrack: (track: Track) => void
  onCreatePlaylist: (initialTrackId?: string) => void
  onAddToPlaylist: (slug: string, trackId: string) => void
}

export const HomePage = memo(function HomePage({
  tracks,
  playlists,
  sourceCount,
  currentTrackId,
  isPlaying,
  sortField,
  sortDir,
  appearance,
  onSortChange,
  onPlayAll,
  onOpenFolders,
  onPlayTrack,
  onDeleteTrack,
  onCreatePlaylist,
  onAddToPlaylist,
}: HomePageProps) {
  const sortedTracks = useMemo(
    () => sortTracks(tracks, sortField, sortDir),
    [tracks, sortField, sortDir],
  )
  const iconPack = appearance.iconPack

  const handlePlayRow = useCallback(
    (track: Track) => {
      onPlayTrack(track, sortedTracks, 'Songs', 'songs')
    },
    [onPlayTrack, sortedTracks],
  )

  const handleCreatePlaylistWithTrack = useCallback(
    (tid: string) => {
      onCreatePlaylist(tid)
    },
    [onCreatePlaylist],
  )

  const rowHeight = estimateTrackRowHeight(appearance.density, appearance.showTrackOverline)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-8 pt-6 sm:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            LIBRARY
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            Songs
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenFolders}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer"
          >
            <ZunoIcon name="folder" pack={iconPack} className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Folders</span>
            {sourceCount > 1 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {sourceCount}
              </span>
            )}
          </button>

          {sortedTracks.length > 0 && (
            <button
              onClick={() => onPlayAll(sortedTracks)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
            >
              <ZunoIcon name="play" pack={iconPack} filled className="h-3.5 w-3.5" />
              Play all
            </button>
          )}
        </div>
      </div>

      {/* AVAILABLE SONGS + Sort By */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              AVAILABLE SONGS
            </h2>
            <span className="tabular-nums text-xs text-muted-foreground">
              {sortedTracks.length}
            </span>
          </div>

          {sortedTracks.length > 0 && (
            <SortControl
              field={sortField}
              dir={sortDir}
              onChange={onSortChange}
            />
          )}
        </div>

        {sortedTracks.length === 0 ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-border py-14 text-center text-xs text-muted-foreground">
            <p>No songs yet. Add a music folder to get started.</p>
            <button
              type="button"
              onClick={onOpenFolders}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
            >
              <ZunoIcon name="folder" pack={iconPack} className="h-3.5 w-3.5" />
              Add Folder
            </button>
          </div>
        ) : (
          <VirtualTrackList
            items={sortedTracks}
            getKey={(t) => t.id}
            estimateRowHeight={rowHeight}
            revealStyle={appearance.scrollRevealStyle}
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
                  deleteLabel="Delete"
                  onPlay={handlePlayRow}
                  onAddToPlaylist={onAddToPlaylist}
                  onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
                  onDelete={onDeleteTrack}
                />
              )
            }}
          />
        )}
      </section>
    </div>
  )
})
