import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { ArtworkTile } from '@/components/ArtworkTile'
import { Loader2 } from '@/components/PulseBarsLoader'
import { ZunoIcon } from '@/components/ZunoIcon'
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
  playlists: Playlist[]
  appearance?: AppearanceSettings
  deleteLabel?: string
  onPlay: () => void
  onAddToPlaylist: (playlistSlug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId: string) => void
  onDelete: () => void
}

/**
 * Clean song row with customizable playing style and a single three-dots (...) menu card
 * containing Add to playlist and Delete actions.
 */
export function TrackRow({
  track,
  index,
  active,
  isPlaying,
  playlists,
  appearance = DEFAULT_APPEARANCE,
  deleteLabel = 'Delete',
  onPlay,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
  onDelete,
}: TrackRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuView, setMenuView] = useState<'main' | 'playlists'>('main')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setMenuView('main')
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setMenuView('main')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  const overline =
    track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist

  const iconPack = appearance.iconPack
  const iconStyle = appearance.trackIconStyle
  const playingStyle = appearance.playingStyle
  const playingHere = active && isPlaying

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
        {/* Leading visual: Equalizer / Pulse Bars styles use clean square cover tile; others use play/number control */}
        {playingStyle === 'equalizer' || playingStyle === 'pulse-bars' ? (
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
            <ArtworkTile
              trackId={track.id}
              hasCover={track.has_cover}
              seed={track.title}
              variant="thumb"
            />
          </div>
        ) : iconStyle === 'number' ? (
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center tabular-nums text-xs text-muted-foreground">
            {playingHere ? (
              <ZunoIcon
                name="pause"
                pack={iconPack}
                filled
                className="h-3.5 w-3.5 text-primary transition-transform duration-200"
              />
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
                <ZunoIcon
                  name="play"
                  pack={iconPack}
                  filled
                  className="hidden h-3.5 w-3.5 text-foreground group-hover:block"
                />
              </>
            )}
          </div>
        ) : iconStyle === 'minimal' || playingStyle === 'minimal' ? (
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
            <PlayPauseMorph
              playing={playingHere}
              active={active}
              pack={iconPack}
              minimal
            />
          </div>
        ) : (
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            {playingHere && appearance.showPlayPulse && (
              <span
                aria-hidden="true"
                className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary"
              />
            )}
            <div
              className={cn(
                'relative z-10 flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200',
                iconStyle === 'filled'
                  ? active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground group-hover:bg-accent'
                  : active
                    ? 'border border-primary bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-foreground group-hover:border-muted-foreground/50',
              )}
            >
              <PlayPauseMorph playing={playingHere} active={active} pack={iconPack} />
            </div>
          </div>
        )}

        {/* Artist eyebrow + Song Title */}
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
        </div>

        {/* Right: Single Equalizer/PulseBars toggle + Duration + Three-dots (...) menu */}
        <div
          ref={menuRef}
          className="relative flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {(playingStyle === 'equalizer' || playingStyle === 'pulse-bars') && (
            <Tooltip label={playingHere ? 'Pause' : 'Play'} side="top">
              <button
                type="button"
                onClick={onPlay}
                aria-label={playingHere ? 'Pause' : 'Play'}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-accent cursor-pointer"
              >
                {playingHere ? (
                  playingStyle === 'pulse-bars' ? (
                    <Loader2
                      barCount={5}
                      height={16}
                      width={2.5}
                      gap={2}
                      speed={0.95}
                    />
                  ) : (
                    <span className="flex h-5 items-end justify-center gap-[2.5px]">
                      <span className="zuno-eq-bar" />
                      <span className="zuno-eq-bar" />
                      <span className="zuno-eq-bar" />
                      <span className="zuno-eq-bar" />
                    </span>
                  )
                ) : (
                  <ZunoIcon
                    name="play"
                    pack={iconPack}
                    filled
                    className={cn(
                      'h-3.5 w-3.5 translate-x-[0.5px] transition-colors',
                      active
                        ? 'text-primary'
                        : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                )}
              </button>
            </Tooltip>
          )}

          {appearance.showTrackDuration && (
            <span className="tabular-nums text-xs text-muted-foreground">
              {formatTime(track.duration_secs)}
            </span>
          )}

          {/* Three dots (...) options trigger */}
          <Tooltip label="More" side="top">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((o) => {
                  if (o) setMenuView('main')
                  return !o
                })
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-accent hover:text-foreground cursor-pointer',
                menuOpen
                  ? 'bg-accent text-foreground opacity-100'
                  : 'lg:opacity-0 lg:group-hover:opacity-100',
              )}
              aria-label="Song options"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </Tooltip>

          {/* Compact three-dots popover card: Add to playlist + Delete */}
          {menuOpen && (
            <div className="absolute top-9 right-0 z-40 w-48 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-2xl animate-dock-pop">
              {menuView === 'main' ? (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setMenuView('playlists')}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <ZunoIcon name="playlist" pack={iconPack} className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Add to playlist</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>

                  <div className="my-1 border-t border-border/70" />

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setMenuView('main')
                      onDelete()
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <ZunoIcon name="trash" pack={iconPack} className="h-3.5 w-3.5" />
                    <span>{deleteLabel}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setMenuView('main')}
                    className="flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Add to playlist</span>
                  </button>
                  <div className="my-1 border-t border-border/70" />
                  <div className="max-h-44 overflow-y-auto space-y-0.5">
                    {playlists.map((pl) => {
                      const exists = pl.track_ids.includes(track.id)
                      return (
                        <button
                          key={pl.slug}
                          type="button"
                          onClick={() => {
                            if (!exists) onAddToPlaylist(pl.slug, track.id)
                            setMenuOpen(false)
                            setMenuView('main')
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary cursor-pointer"
                        >
                          <span className="truncate">{pl.title}</span>
                          {exists && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div className="my-1 border-t border-border/70" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setMenuView('main')
                      onCreatePlaylistWithTrack(track.id)
                    }}
                    className="flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
                    <span>New playlist</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlayPauseMorph({
  playing,
  active,
  pack,
  minimal = false,
}: {
  playing: boolean
  active: boolean
  pack: AppearanceSettings['iconPack']
  minimal?: boolean
}) {
  return (
    <span className="relative flex h-4 w-4 items-center justify-center">
      <ZunoIcon
        name="play"
        pack={pack}
        filled
        className={cn(
          'absolute h-3.5 w-3.5 translate-x-[0.5px] transition-all duration-200',
          minimal && active && 'text-primary',
          playing ? 'scale-50 opacity-0 rotate-12' : 'scale-100 opacity-100 rotate-0',
        )}
      />
      <ZunoIcon
        name="pause"
        pack={pack}
        filled
        className={cn(
          'absolute h-3.5 w-3.5 transition-all duration-200',
          minimal && active && 'text-primary',
          playing ? 'scale-100 opacity-100 rotate-0' : 'scale-50 opacity-0 -rotate-12',
        )}
      />
    </span>
  )
}
