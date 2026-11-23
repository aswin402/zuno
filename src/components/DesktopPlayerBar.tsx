import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Slider } from '@/components/ui/slider'
import { Tooltip } from '@/components/ui/tooltip'
import { PulseHeart } from '@/components/PulseHeart'
import { Scrubber } from '@/components/Scrubber'
import { WaveformPlayButton } from '@/components/WaveformPlayButton'
import { ZunoIcon } from '@/components/ZunoIcon'
import { cn, formatTime } from '@/lib/utils'
import { DEFAULT_APPEARANCE, type AppearanceSettings } from '@/lib/appearance'
import type { RepeatMode, Track } from '@/lib/zunoApi'

interface DesktopPlayerBarProps {
  track: Track | null
  isPlaying: boolean
  isFavorite: boolean
  position: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  eqEnabled?: boolean
  eqLabel?: string
  eqOpen?: boolean
  appearance?: AppearanceSettings
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
  onSeekChange: (secs: number) => void
  onSeekCommit: (secs: number) => void
  onVolumeChange: (vol: number) => void
  onToggleFavorite: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onToggleEqualizer?: () => void
  onExpandPlayer?: () => void
}

/**
 * Floating sticky horizontal bottom player bar for Desktop (>= 1024px).
 * Supports Skiper25 Waveform Play button option, PulseHeart favorite animation,
 * multi-pack icons, and themed tooltips.
 */
export function DesktopPlayerBar({
  track,
  isPlaying,
  isFavorite,
  position,
  duration,
  volume,
  shuffle,
  repeat,
  eqEnabled = false,
  eqLabel = 'Off',
  eqOpen = false,
  appearance = DEFAULT_APPEARANCE,
  onTogglePlay,
  onPrev,
  onNext,
  onSeekChange,
  onSeekCommit,
  onVolumeChange,
  onToggleFavorite,
  onToggleShuffle,
  onCycleRepeat,
  onToggleEqualizer,
  onExpandPlayer,
}: DesktopPlayerBarProps) {
  const [volOpen, setVolOpen] = useState(false)
  const effectiveDuration = duration > 0 ? duration : (track?.duration_secs ?? 0)
  const iconPack = appearance.iconPack

  const artistLabel = track
    ? track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist
    : 'Select a song'

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
            ? 'pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-md hover:border-muted-foreground/35'
            : 'border-t border-border bg-card',
        )}
      >
        {/* 1. Transport Controls (Classic or Skiper25 Waveform toggle) */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip label="Previous" side="top">
            <button
              onClick={onPrev}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              aria-label="Previous"
            >
              <ZunoIcon name="prev" pack={iconPack} filled className="h-4 w-4" />
            </button>
          </Tooltip>

          <Tooltip label={isPlaying ? 'Pause (Space)' : 'Play (Space)'} side="top">
            {appearance.playButtonStyle === 'waveform' ? (
              <WaveformPlayButton isPlaying={isPlaying} onClick={onTogglePlay} />
            ) : (
              <button
                onClick={onTogglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary cursor-pointer"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <ZunoIcon
                  name={isPlaying ? 'pause' : 'play'}
                  pack={iconPack}
                  filled
                  className={cn('h-4.5 w-4.5', !isPlaying && 'translate-x-[1px]')}
                />
              </button>
            )}
          </Tooltip>

          <Tooltip label="Next" side="top">
            <button
              onClick={onNext}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              aria-label="Next"
            >
              <ZunoIcon name="next" pack={iconPack} filled className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        {/* 2. Track Title & Artist (clicking dock or track opens full-screen player) */}
        <Tooltip label="Open full-screen player" side="top" className="w-48 shrink-0 min-w-0 justify-start">
          <div className="w-full min-w-0 text-left">
            <p className="truncate text-sm font-semibold leading-snug text-foreground">
              {track ? track.title : 'Not Playing'}
            </p>
            <p className="truncate text-xs leading-snug text-muted-foreground">
              {artistLabel}
            </p>
          </div>
        </Tooltip>

        {/* 3. Multi-style Progress Scrubber */}
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

          <DropdownMenu open={volOpen} onOpenChange={setVolOpen}>
            <Tooltip label={`Volume: ${Math.round(volume * 100)}%`} side="top" disabled={volOpen}>
              <DropdownMenuTrigger
                aria-label="Volume"
                className={cn(
                  'h-8 w-8 hover:bg-secondary',
                  volOpen && 'bg-secondary text-foreground',
                )}
              >
                <ZunoIcon
                  name={volume <= 0.001 ? 'mute' : 'volume'}
                  pack={iconPack}
                  className="h-4 w-4"
                />
              </DropdownMenuTrigger>
            </Tooltip>

            <DropdownMenuContent
              align="end"
              side="top"
              autoFocusFirst={false}
              className="min-w-0 w-44 flex-row items-center gap-2.5 px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Mute or unmute"
              >
                <ZunoIcon
                  name={volume <= 0.001 ? 'mute' : 'volume'}
                  pack={iconPack}
                  className="h-3.5 w-3.5"
                />
              </button>
              <Slider
                value={volume}
                max={1}
                step={0.01}
                onChange={onVolumeChange}
                ariaLabel="Volume"
                alwaysShowThumb
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </footer>
    </div>
  )
}
