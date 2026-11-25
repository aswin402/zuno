import { memo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { ArtworkTile } from '@/components/ArtworkTile'
import { Loader2 } from '@/components/PulseBarsLoader'
import { ZunoIcon } from '@/components/ZunoIcon'
import { displayArtist } from '@/lib/format'
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
  onPlay: (track: Track) => void
  onAddToPlaylist: (playlistSlug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId: string) => void
  onDelete: (track: Track) => void
}

/**
 * Clean song row with customizable playing style and EaseUI dropdown menu
 * containing Add to playlist and Delete actions.
 */
export const TrackRow = memo(function TrackRow({
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

  const overline = displayArtist(track)

  const iconPack = appearance.iconPack
  const iconStyle = appearance.trackIconStyle
  const playingStyle = appearance.playingStyle
  const playingHere = active && isPlaying

  return (
    <div
      onClick={() => onPlay(track)}
      className={cn(
        'group relative transition-colors cursor-pointer',
        menuOpen && 'z-30',
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

        {/* Right: Single Equalizer/PulseBars toggle + Duration + EaseUI Three-dots (...) menu */}
        <div
          className="relative flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {(playingStyle === 'equalizer' || playingStyle === 'pulse-bars') && (
            <Tooltip label={playingHere ? 'Pause' : 'Play'} side="top">
              <button
                type="button"
                onClick={() => onPlay(track)}
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

          {/* EaseUI Dropdown Menu: Add to playlist + Delete */}
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(next) => {
              setMenuOpen(next)
              if (!next) setMenuView('main')
            }}
          >
            <Tooltip label="More" side="top" disabled={menuOpen}>
              <DropdownMenuTrigger
                aria-label="Song options"
                className={cn(
                  'h-7 w-7 hover:bg-accent',
                  menuOpen
                    ? 'bg-accent text-foreground opacity-100'
                    : 'lg:opacity-0 lg:group-hover:opacity-100',
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
            </Tooltip>

            {menuOpen && (
            <DropdownMenuContent align="end" className="w-52">
              {menuView === 'main' ? (
                <>
                  <DropdownMenuItem
                    keepOpen
                    onSelect={() => setMenuView('playlists')}
                    className="justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <ZunoIcon
                        name="playlist"
                        pack={iconPack}
                        className="h-3.5 w-3.5 text-muted-foreground"
                      />
                      <span>Add to playlist</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    destructive
                    onSelect={() => {
                      setMenuView('main')
                      onDelete(track)
                    }}
                  >
                    <ZunoIcon name="trash" pack={iconPack} className="h-3.5 w-3.5" />
                    <span>{deleteLabel}</span>
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem
                    keepOpen
                    onSelect={() => setMenuView('main')}
                    className="min-h-8 gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Add to playlist</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <div className="max-h-44 overflow-y-auto space-y-0.5">
                    {playlists.map((pl) => {
                      const exists = pl.track_ids.includes(track.id)
                      return (
                        <DropdownMenuItem
                          key={pl.slug}
                          onSelect={() => {
                            if (!exists) onAddToPlaylist(pl.slug, track.id)
                            setMenuView('main')
                          }}
                          className="min-h-8 justify-between"
                        >
                          <span className="truncate">{pl.title}</span>
                          {exists && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </div>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuView('main')
                      onCreatePlaylistWithTrack(track.id)
                    }}
                    className="min-h-8 gap-1.5 text-muted-foreground"
                  >
                    <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
                    <span>New playlist</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
            )}
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
})

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
