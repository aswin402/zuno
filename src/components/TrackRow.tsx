import { useState } from 'react'
import { Check, Pause, Play, Plus, X } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import {
  DEFAULT_APPEARANCE,
  rowPaddingClass,
  rowRadiusClass,
  type AppearanceSettings,
} from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

interface TrackRowProps {
  track: Track
  index?: number
  active: boolean
  isPlaying: boolean
  progressPct?: number
  playlists: Playlist[]
  appearance?: AppearanceSettings
  onPlay: () => void
  onAddToPlaylist: (playlistSlug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId: string) => void
  onRemove?: () => void
}

/**
 * Customizable track row honoring all Customize -> Styles / Icons / Components preferences.
 */
export function TrackRow({
  track,
  index,
  active,
  isPlaying,
  progressPct = 0,
  playlists,
  appearance = DEFAULT_APPEARANCE,
  onPlay,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
  onRemove,
}: TrackRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const overline =
    track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist

  const iconStyle = appearance.trackIconStyle

  return (
    <div
      onClick={onPlay}
      className={cn(
        'group relative transition-colors cursor-pointer',
        rowRadiusClass(appearance.radius),
        rowPaddingClass(appearance.density),
        active ? 'bg-secondary' : 'hover:bg-secondary/55',
      )}
    >
      <div className="flex items-center gap-3.5">
        {/* Leading play / number indicator */}
        {iconStyle === 'number' ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center tabular-nums text-xs text-muted-foreground">
            {active && isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current text-primary" />
            ) : (
              <>
                <span
                  className={cn(
                    'group-hover:hidden',
                    active && 'font-semibold text-primary',
                  )}
                >
                  {String((index ?? 0) + 1).padStart(2, '0')}
                </span>
                <Play className="hidden h-3.5 w-3.5 fill-current text-foreground group-hover:block" />
              </>
            )}
          </div>
        ) : iconStyle === 'minimal' ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
            {active && isPlaying ? (
              <Pause className="h-4 w-4 fill-current text-primary" />
            ) : (
              <Play
                className={cn(
                  'h-4 w-4 translate-x-[0.5px] fill-current',
                  active && 'text-primary',
                )}
              />
            )}
          </div>
        ) : (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
              iconStyle === 'filled'
                ? active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground group-hover:bg-accent'
                : active
                  ? 'border border-primary bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground group-hover:border-muted-foreground/50',
            )}
          >
            {active && isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-[0.5px] fill-current" />
            )}
          </div>
        )}

        {/* Artist eyebrow + Song Title + Active inline mini progress bar */}
        <div className="min-w-0 flex-1">
          {appearance.showTrackOverline && (
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {overline}
            </p>
          )}
          <p
            className={cn(
              'truncate text-[14px] font-medium tracking-tight sm:text-[15px]',
              appearance.showTrackOverline && 'mt-0.5',
              active ? 'text-primary' : 'text-foreground',
            )}
          >
            {track.title}
          </p>

          {active && appearance.showInlineProgress && (
            <div className="mt-2 flex items-center">
              <div className="relative h-[2px] w-full max-w-[180px] rounded-full bg-accent">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                />
                <span
                  className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                  style={{ left: `${Math.min(100, Math.max(0, progressPct))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Duration + Playlist action */}
        <div
          className="relative flex shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {appearance.showTrackDuration && (
            <span className="tabular-nums text-xs text-muted-foreground">
              {formatTime(track.duration_secs)}
            </span>
          )}

          {onRemove ? (
            <button
              onClick={onRemove}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer"
              title="Remove from playlist"
              aria-label="Remove from playlist"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer',
                menuOpen && 'lg:opacity-100 bg-accent text-foreground',
              )}
              title="Add to playlist"
              aria-label="Add to playlist"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}

          {menuOpen && (
            <div className="absolute top-9 right-0 z-30 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
              <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Add to playlist
              </p>
              {playlists.map((pl) => {
                const exists = pl.track_ids.includes(track.id)
                return (
                  <button
                    key={pl.slug}
                    onClick={() => {
                      if (!exists) onAddToPlaylist(pl.slug, track.id)
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-secondary cursor-pointer"
                  >
                    <span className="truncate">{pl.title}</span>
                    {exists && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                )
              })}
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onCreatePlaylistWithTrack(track.id)
                }}
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                New playlist
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
