import { useState } from 'react'
import { Folder, ListMusic, Search, X } from 'lucide-react'
import { TrackRow } from '@/components/TrackRow'
import { cn, formatTime } from '@/lib/utils'
import type { AppearanceSettings } from '@/lib/appearance'
import type { FolderSummary, Playlist, Track } from '@/lib/zunoApi'

type FilterChip = 'all' | 'folders' | 'playlists'

interface SearchPageProps {
  query: string
  onQueryChange: (q: string) => void
  results: Track[]
  folders: FolderSummary[]
  playlists: Playlist[]
  currentTrackId: string | null
  isPlaying: boolean
  progressPct: number
  appearance: AppearanceSettings
  onPlayTrack: (track: Track) => void
  onOpenFolder: (folderName: string) => void
  onOpenPlaylist: (slug: string) => void
  onAddToPlaylist: (slug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId?: string) => void
}

export function SearchPage({
  query,
  onQueryChange,
  results,
  folders,
  playlists,
  currentTrackId,
  isPlaying,
  progressPct,
  appearance,
  onPlayTrack,
  onOpenFolder,
  onOpenPlaylist,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
}: SearchPageProps) {
  const [chip, setChip] = useState<FilterChip>('all')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-8 pt-6 sm:px-8">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          EXPLORE
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
          Search
        </h1>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Songs, artists, or folders..."
          className="h-11 w-full rounded-full border border-border bg-card pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'folders', label: 'Folders' },
            { id: 'playlists', label: 'Playlists' },
          ] as const
        ).map((c) => (
          <button
            key={c.id}
            onClick={() => setChip(c.id)}
            className={cn(
              'h-8 rounded-full px-4 text-xs font-medium transition-colors cursor-pointer',
              chip === c.id
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!query && (chip === 'all' || chip === 'folders') && folders.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            FOLDERS
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {folders.map((f) => (
              <button
                key={f.name}
                onClick={() => onOpenFolder(f.name)}
                className="flex h-24 flex-col justify-between rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary cursor-pointer"
              >
                <Folder className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="truncate text-sm font-medium text-foreground">
                    {f.name}
                  </p>
                  <p className="tabular-nums text-[11px] text-muted-foreground">
                    {f.track_count} tracks · {formatTime(f.total_duration_secs)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {!query && chip === 'playlists' && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            PLAYLISTS
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {playlists.map((pl) => (
              <button
                key={pl.slug}
                onClick={() => onOpenPlaylist(pl.slug)}
                className="flex h-24 flex-col justify-between rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary cursor-pointer"
              >
                <ListMusic className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="truncate text-sm font-medium text-foreground">
                    {pl.title}
                  </p>
                  <p className="tabular-nums text-[11px] text-muted-foreground">
                    {pl.track_ids.length} tracks
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {(query || chip === 'all') && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {query ? 'RESULTS' : 'TRACKS'}
          </h2>
          {results.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No matching songs found.
            </p>
          ) : (
            <div className="space-y-1">
              {results.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  active={track.id === currentTrackId}
                  isPlaying={isPlaying}
                  progressPct={progressPct}
                  playlists={playlists}
                  appearance={appearance}
                  onPlay={() => onPlayTrack(track)}
                  onAddToPlaylist={onAddToPlaylist}
                  onCreatePlaylistWithTrack={onCreatePlaylistWithTrack}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
