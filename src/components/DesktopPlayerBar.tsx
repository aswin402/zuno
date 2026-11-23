import { useState } from 'react'
import {
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
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
}

/**
 * Minimal single-row horizontal bottom player bar for Desktop (>= 1024px).
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
}: DesktopPlayerBarProps) {
  const [volOpen, setVolOpen] = useState(false)
  const effectiveDuration = duration > 0 ? duration : (track?.duration_secs ?? 0)
  const safeMax = effectiveDuration > 0 ? effectiveDuration : 1
  const clamped = Math.min(Math.max(position, 0), safeMax)
  const pct = (clamped / safeMax) * 100

  const artistLabel = track
    ? track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist
    : 'Select a song'

  const floating = appearance.playerBarStyle === 'floating'

  return (
    <div
      className={cn(
        'hidden shrink-0 select-none lg:block',
        floating ? 'px-5 pb-4 pt-1' : '',
      )}
    >
      <footer
        className={cn(
          'flex h-16 items-center gap-5 bg-card px-5',
          floating
            ? 'mx-auto max-w-6xl rounded-2xl border border-border shadow-2xl'
            : 'border-t border-border',
        )}
      >
        {/* 1. Minimal Transport Controls */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onPrev}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
            title="Previous"
            aria-label="Previous"
          >
            <SkipBack className="h-4 w-4 fill-current" />
          </button>

          <button
            onClick={onTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary cursor-pointer"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="h-4.5 w-4.5 fill-current" />
            ) : (
              <Play className="h-4.5 w-4.5 translate-x-[1px] fill-current" />
            )}
          </button>

          <button
            onClick={onNext}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
            title="Next"
            aria-label="Next"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        </div>

        {/* 2. Track Title & Artist */}
        <div className="w-52 shrink-0 min-w-0">
          <p className="truncate text-sm font-semibold leading-snug text-foreground">
            {track ? track.title : 'Not Playing'}
          </p>
          <p className="truncate text-xs leading-snug text-muted-foreground">
            {artistLabel}
          </p>
        </div>

        {/* 3. Full-width Hairline Progress Scrubber */}
        <div className="relative flex h-6 min-w-0 flex-1 items-center group">
          <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all',
              appearance.scrubberKnob === 'solid' &&
                'h-3.5 w-3.5 bg-primary shadow-sm group-hover:scale-115',
              appearance.scrubberKnob === 'ring' &&
                'h-3.5 w-3.5 border-2 border-primary bg-card shadow-sm group-hover:scale-115',
              appearance.scrubberKnob === 'line' &&
                'h-3 w-3 bg-primary opacity-0 group-hover:opacity-100',
            )}
            style={{ left: `${pct}%` }}
          />
          <input
            type="range"
            aria-label="Playback position"
            min={0}
            max={safeMax}
            step={0.1}
            value={clamped}
            onChange={(e) => onSeekChange(Number(e.target.value))}
            onMouseUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        {/* 4. Inline Timestamp */}
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
          {formatTime(position)} / {formatTime(effectiveDuration)}
        </span>

        {/* 5. Utility Controls */}
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            onClick={onToggleFavorite}
            disabled={!track}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 cursor-pointer',
              isFavorite
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
            title={isFavorite ? 'Remove from Favorites' : 'Favorite'}
            aria-label="Favorite"
          >
            <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
          </button>

          <button
            onClick={onCycleRepeat}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
              repeat !== 'off'
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
            title={`Repeat: ${repeat}`}
            aria-label="Repeat"
          >
            {repeat === 'one' ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={onToggleShuffle}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer',
              shuffle
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
            title="Shuffle"
            aria-label="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <button
            onClick={() => setVolOpen((v) => !v)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
              volOpen
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
            title={`Volume (${Math.round(volume * 100)}%)`}
            aria-label="Volume"
          >
            {volume <= 0.001 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>

          {volOpen && (
            <div className="absolute right-0 bottom-12 z-30 flex w-40 items-center gap-2.5 rounded-xl border border-border bg-popover px-3 py-2.5 shadow-2xl">
              <button
                onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Mute or unmute"
              >
                {volume <= 0.001 ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              <Slider
                value={volume}
                max={1}
                step={0.01}
                onChange={onVolumeChange}
                ariaLabel="Volume"
                alwaysShowThumb
              />
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
