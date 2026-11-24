import { memo, useMemo } from 'react'
import { TrackRow } from '@/components/TrackRow'
import { SortControl } from '@/components/SortControl'
import { ZunoIcon } from '@/components/ZunoIcon'
import { sortTracks, type SortDir, type SortField } from '@/lib/sortTracks'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface HomePageProps {
  tracks: Track[]
  playlists: Playlist[]
  currentTrackId: string | null
  isPlaying: boolean
  sortField: SortField
  sortDir: SortDir
  appearance: AppearanceSettings
  onSortChange: (field: SortField, dir: SortDir) => void
  onPlayAll: (subset?: Track[]) => void
  onPlayTrack: (track: Track, subset: Track[], label: string, sourceKey: string) => void
  onDeleteTrack: (track: Track) => void
  onCreatePlaylist: (initialTrackId?: string) => void
  onAddToPlaylist: (slug: string, trackId: string) => void
}

export const HomePage = memo(function HomePage({
  tracks,
  playlists,
  currentTrackId,
  isPlaying,
  sortField,
  sortDir,
  appearance,
  onSortChange,
  onPlayAll,
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

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-8 pt-6 sm:px-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            LIBRARY
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            Songs
          </h1>
        </div>

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
          <div className="rounded-2xl border border-dashed border-border py-14 text-center text-xs text-muted-foreground">
            Add audio files to{' '}
            <span className="font-mono text-foreground">zuno/songs/</span> and rescan.
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
                playlists={playlists}
                appearance={appearance}
                deleteLabel="Delete"
                onPlay={() =>
                  onPlayTrack(track, sortedTracks, 'Songs', 'songs')
                }
                onAddToPlaylist={onAddToPlaylist}
                onCreatePlaylistWithTrack={(tid) => onCreatePlaylist(tid)}
                onDelete={() => onDeleteTrack(track)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
})
