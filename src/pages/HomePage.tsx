import { useMemo } from 'react'
import { Clock, Play, RefreshCw, Search } from 'lucide-react'
import { TrackRow } from '@/components/TrackRow'
import { SortControl } from '@/components/SortControl'
import { sortTracks, type SortDir, type SortField } from '@/lib/sortTracks'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface HomePageProps {
  tracks: Track[]
  lastPlayed: Track[]
  playlists: Playlist[]
  currentTrackId: string | null
  isPlaying: boolean
  progressPct: number
  sortField: SortField
  sortDir: SortDir
  appearance: AppearanceSettings
  onSortChange: (field: SortField, dir: SortDir) => void
  onPlayAll: (subset?: Track[]) => void
  onPlayTrack: (track: Track, subset: Track[], label?: string) => void
  onCreatePlaylist: (initialTrackId?: string) => void
  onAddToPlaylist: (slug: string, trackId: string) => void
  onOpenSearch: () => void
  onRescan: () => void
}

/**
 * Main "Songs" Home page:
 * Shows Last Played + Available Songs with Sort By (name, artist, album, time, size, duration).
 */
export function HomePage({
  tracks,
  lastPlayed,
  playlists,
  currentTrackId,
  isPlaying,
  progressPct,
  sortField,
  sortDir,
  appearance,
  onSortChange,
  onPlayAll,
  onPlayTrack,
  onCreatePlaylist,
  onAddToPlaylist,
  onOpenSearch,
  onRescan,
}: HomePageProps) {
  const sortedTracks = useMemo(
    () => sortTracks(tracks, sortField, sortDir),
    [tracks, sortField, sortDir],
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-5 pb-8 pt-6 sm:px-8">
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

        <div className="flex items-center gap-2">
          {sortedTracks.length > 0 && (
            <button
              onClick={() => onPlayAll(sortedTracks)}
              className="hidden h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Play all
            </button>
          )}
          <button
            onClick={onRescan}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden cursor-pointer"
            title="Rescan songs"
            aria-label="Rescan songs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSearch}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden cursor-pointer"
            title="Search"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* LAST PLAYED */}
      {appearance.showLastPlayed && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              LAST PLAYED
            </h2>
            {lastPlayed.length > 0 && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {lastPlayed.length}
              </span>
            )}
          </div>

          {lastPlayed.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/50 px-4 py-4 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span>Songs you play will appear here.</span>
            </div>
          ) : (
            <div className="space-y-1">
              {lastPlayed.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  active={track.id === currentTrackId}
                  isPlaying={isPlaying}
                  progressPct={progressPct}
                  playlists={playlists}
                  appearance={appearance}
                  onPlay={() => onPlayTrack(track, lastPlayed, 'Last Played')}
                  onAddToPlaylist={onAddToPlaylist}
                  onCreatePlaylistWithTrack={(tid) => onCreatePlaylist(tid)}
                />
              ))}
            </div>
          )}
        </section>
      )}

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
                progressPct={progressPct}
                playlists={playlists}
                appearance={appearance}
                onPlay={() => onPlayTrack(track, sortedTracks, 'Songs')}
                onAddToPlaylist={onAddToPlaylist}
                onCreatePlaylistWithTrack={(tid) => onCreatePlaylist(tid)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
