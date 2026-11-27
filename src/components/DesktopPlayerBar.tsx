import { useState } from 'react'
import { Check, ListPlus, LoaderCircle, Radio, RefreshCw, Square } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconSwap, TextSwap } from '@/components/ui/motion'
import { Tooltip } from '@/components/ui/tooltip'
import { Loader2 } from '@/components/PulseBarsLoader'
import { PulseHeart } from '@/components/PulseHeart'
import { Scrubber } from '@/components/Scrubber'
import { VinylPlayButton, WaveformPlayButton } from '@/components/WaveformPlayButton'
import { ZunoIcon } from '@/components/ZunoIcon'
import { displayArtist } from '@/lib/format'
import { cn, formatTime } from '@/lib/utils'
import { DEFAULT_APPEARANCE, type AppearanceSettings } from '@/lib/appearance'
import type { Playlist, RepeatMode, Track } from '@/lib/zunoApi'

interface DesktopPlayerBarProps {
  track: Track | null
  isPlaying: boolean
  isFavorite: boolean
  position: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  playlists: Playlist[]
  eqEnabled?: boolean
  eqLabel?: string
  eqOpen?: boolean
  liveLabel?: string | null
  isBuffering?: boolean
  appearance?: AppearanceSettings
  onTogglePlay: () => void
  onReconnectRadio?: () => void
  onDisconnectRadio?: () => void
  onPrev: () => void
  onNext: () => void
  onSeekChange: (secs: number) => void
  onSeekCommit: (secs: number) => void
  onToggleFavorite: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onAddToPlaylist: (playlistSlug: string, trackId: string) => void
  onRemoveFromPlaylist?: (playlistSlug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId?: string) => void
  onToggleEqualizer?: () => void
  onExpandPlayer?: () => void
}

/**
 * Floating sticky horizontal bottom player bar for Desktop (>= 1024px).
 * Supports Skiper25 Waveform Play button option, PulseHeart favorite animation,
 * multi-pack icons, Add-to-Playlist quick menu, and themed tooltips.
 */
export function DesktopPlayerBar({
  track,
  isPlaying,
  isFavorite,
  position,
  duration,
  shuffle,
  repeat,
  playlists,
  eqEnabled = false,
  eqLabel = 'Off',
  eqOpen = false,
  liveLabel = null,
  isBuffering = false,
  appearance = DEFAULT_APPEARANCE,
  onTogglePlay,
  onReconnectRadio,
  onDisconnectRadio,
  onPrev,
  onNext,
  onSeekChange,
  onSeekCommit,
  onToggleFavorite,
  onToggleShuffle,
  onCycleRepeat,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onCreatePlaylistWithTrack,
  onToggleEqualizer,
  onExpandPlayer,
}: DesktopPlayerBarProps) {
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false)
  const canAddToPlaylist = Boolean(track && !liveLabel)
  const effectiveDuration = duration > 0 ? duration : (track?.duration_secs ?? 0)
  const iconPack = appearance.iconPack

  const artistLabel = track ? displayArtist(track) : 'Select a song'

  const floating = appearance.playerBarStyle === 'floating'
  const repeatLabel =
    repeat === 'off' ? 'Repeat: Off' : repeat === 'all' ? 'Repeat: All' : 'Repeat: One'

  return (
    <div
      className={cn(
        'hidden select-none lg:block',
        floating
          ? 'pointer-events-none absolute inset-x-0 bottom-4 z-20 px-6'
          : 'shrink-0',
      )}
    >
      <footer
        onClick={() => onExpandPlayer?.()}
        className={cn(
          'flex h-16 items-center gap-5 px-5 transition-colors',
          onExpandPlayer && 'cursor-pointer',
          floating
            ? 'pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-border bg-card shadow-2xl hover:border-muted-foreground/35'
            : 'border-t border-border bg-card',
        )}
      >
        {/* 1. Transport Controls (Classic or Skiper25 Waveform toggle) */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip label={liveLabel ? 'Previous station' : 'Previous'} side="top">
            <button
              onClick={onPrev}
              className="t-press flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              aria-label={liveLabel ? 'Previous station' : 'Previous'}
            >
              <ZunoIcon name="prev" pack={iconPack} filled className="h-4 w-4" />
            </button>
          </Tooltip>

          {liveLabel ? (
            <>
              <Tooltip
                label={
                  isBuffering
                    ? 'Connecting FM...'
                    : isPlaying
                      ? 'Reconnect FM'
                      : 'Connect FM'
                }
                side="top"
              >
                <button
                  onClick={onReconnectRadio ?? onTogglePlay}
                  className="t-press flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
                  aria-label={isPlaying ? 'Reconnect FM' : 'Connect FM'}
                >
                  {isBuffering ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : isPlaying ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <Radio className="h-4 w-4" />
                  )}
                </button>
              </Tooltip>

              {(isPlaying || isBuffering) && onDisconnectRadio && (
                <Tooltip label="Disconnect FM" side="top">
                  <button
                    onClick={onDisconnectRadio}
                    className="t-press flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                    aria-label="Disconnect FM"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                </Tooltip>
              )}
            </>
          ) : (
            <Tooltip label={isPlaying ? 'Pause (Space)' : 'Play (Space)'} side="top">
              {appearance.playButtonStyle === 'waveform' ? (
                <WaveformPlayButton isPlaying={isPlaying} onClick={onTogglePlay} />
              ) : appearance.playButtonStyle === 'vinyl' ? (
                <VinylPlayButton isPlaying={isPlaying} onClick={onTogglePlay} />
              ) : (
                <button
                  onClick={onTogglePlay}
                  className="t-press flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-secondary cursor-pointer"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  <IconSwap
                    active={isPlaying ? 'b' : 'a'}
                    iconA={
                      <ZunoIcon
                        name="play"
                        pack={iconPack}
                        filled
                        className="h-4.5 w-4.5 translate-x-[1px]"
                      />
                    }
                    iconB={
                      <ZunoIcon
                        name="pause"
                        pack={iconPack}
                        filled
                        className="h-4.5 w-4.5"
                      />
                    }
                  />
                </button>
              )}
            </Tooltip>
          )}

          <Tooltip label={liveLabel ? 'Next station' : 'Next'} side="top">
            <button
              onClick={onNext}
              className="t-press flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              aria-label={liveLabel ? 'Next station' : 'Next'}
            >
              <ZunoIcon name="next" pack={iconPack} filled className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        {/* 2. Track Title & Artist (clicking dock or track opens full-screen player) */}
        <Tooltip label="Open full-screen player" side="top" className="w-48 shrink-0 min-w-0 justify-start">
          <div className="w-full min-w-0 text-left">
            <TextSwap
              as="p"
              text={track ? track.title : 'Not Playing'}
              className="truncate text-sm font-semibold leading-snug text-foreground"
            />
            <TextSwap
              as="p"
              text={artistLabel}
              className="truncate text-xs leading-snug text-muted-foreground"
            />
          </div>
        </Tooltip>

        {/* 3. Multi-style Progress Scrubber OR Live FM Indicator */}
        {liveLabel ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-accent">
              <div
                className={cn(
                  'h-full w-full rounded-full bg-primary transition-opacity',
                  isPlaying ? 'opacity-100' : 'opacity-35',
                )}
              />
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wide text-foreground whitespace-nowrap">
              {isBuffering ? (
                <LoaderCircle className="h-3 w-3 animate-spin text-primary" />
              ) : isPlaying ? (
                <Loader2
                  barCount={3}
                  height={11}
                  width={2}
                  gap={1.5}
                  speed={0.9}
                  color="var(--primary)"
                />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              )}
              {liveLabel}
            </span>
          </div>
        ) : (
          <>
            <div
              className="min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Scrubber
                value={position}
                max={effectiveDuration}
                styleVariant={appearance.scrubberKnob}
                seed={track?.id ?? track?.title ?? 'zuno'}
                onChange={onSeekChange}
                onCommit={onSeekCommit}
              />
            </div>

            {/* 4. Inline Timestamp */}
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
              {formatTime(position)} / {formatTime(effectiveDuration)}
            </span>
          </>
        )}

        {/* 5. Utility Controls */}
        <div
          className="relative flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip
            label={isFavorite ? 'Remove favorite' : 'Favorite'}
            side="top"
          >
            <PulseHeart
              liked={isFavorite}
              disabled={!track}
              iconPack={iconPack}
              onToggle={onToggleFavorite}
            />
          </Tooltip>

          <Tooltip label={repeatLabel} side="top">
            <button
              onClick={onCycleRepeat}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                repeat !== 'off'
                  ? 'bg-secondary text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              aria-label={repeatLabel}
            >
              <ZunoIcon
                name={repeat === 'one' ? 'repeat1' : 'repeat'}
                pack={iconPack}
                className="h-4 w-4"
              />
            </button>
          </Tooltip>

          <Tooltip label={shuffle ? 'Shuffle: On' : 'Shuffle: Off'} side="top">
            <button
              onClick={onToggleShuffle}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                shuffle
                  ? 'bg-secondary text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              aria-label="Shuffle"
            >
              <ZunoIcon name="shuffle" pack={iconPack} className="h-4 w-4" />
            </button>
          </Tooltip>

          {onToggleEqualizer && (
            <Tooltip
              label={eqEnabled ? `Equalizer · ${eqLabel}` : 'Equalizer: Off'}
              side="top"
            >
              <button
                onClick={onToggleEqualizer}
                className={cn(
                  'relative flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                  eqOpen || eqEnabled
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
                aria-label="Equalizer"
              >
                <ZunoIcon name="equalizer" pack={iconPack} className="h-4 w-4" />
                {eqEnabled && (
                  <span
                    className="pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
              </button>
            </Tooltip>
          )}

          <DropdownMenu
            open={playlistMenuOpen && canAddToPlaylist}
            onOpenChange={(next) => {
              if (!canAddToPlaylist) {
                setPlaylistMenuOpen(false)
                return
              }
              setPlaylistMenuOpen(next)
            }}
          >
            <Tooltip
              label="Add to playlist"
              side="top"
              disabled={playlistMenuOpen || !canAddToPlaylist}
            >
              <DropdownMenuTrigger
                disabled={!canAddToPlaylist}
                aria-label="Add to playlist"
                className={cn(
                  'h-8 w-8 hover:bg-secondary',
                  playlistMenuOpen && 'bg-secondary text-foreground',
                )}
              >
                <ListPlus className="h-4 w-4" />
              </DropdownMenuTrigger>
            </Tooltip>

            {canAddToPlaylist && track && (
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel>Add to playlist</DropdownMenuLabel>
                {playlists.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                    No playlists yet
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {playlists.map((pl) => {
                      const exists = pl.track_ids.includes(track.id)
                      return (
                        <DropdownMenuItem
                          key={pl.slug}
                          onSelect={() => {
                            if (exists) {
                              onRemoveFromPlaylist?.(pl.slug, track.id)
                            } else {
                              onAddToPlaylist(pl.slug, track.id)
                            }
                          }}
                          className="min-h-8 justify-between"
                        >
                          <span className="truncate">{pl.title}</span>
                          {exists ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                              {pl.track_ids.length}
                            </span>
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </div>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onSelect={() => onCreatePlaylistWithTrack(track.id)}
                  className="min-h-8 gap-1.5 text-muted-foreground"
                >
                  <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
                  <span>New playlist</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        </div>
      </footer>
    </div>
  )
}
