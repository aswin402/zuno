import { useState } from 'react'
import {
  ChevronDown,
  Heart,
  ListMusic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { ArtworkTile } from '@/components/ArtworkTile'
import { cn, formatTime } from '@/lib/utils'
import type { Playlist, RepeatMode, Track } from '@/lib/zunoApi'

interface NowPlayingPanelProps {
  track: Track | null
  playlistLabel: string
  isPlaying: boolean
  isFavorite: boolean
  position: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  playlists: Playlist[]
  isMobileSheet?: boolean
  onCloseMobile?: () => void
  onOpenQueue: () => void
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
  onSeekChange: (secs: number) => void
  onSeekCommit: (secs: number) => void
  onVolumeChange: (vol: number) => void
  onToggleFavorite: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onAddToPlaylist: (slug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId?: string) => void
}

/**
 * Responsive Now Playing panel honoring musicapp2.figcraft:
 * - Signature inverted-arch artwork flush to top + overlapping floating transport pill
 * - Fits cleanly inside 100dvh on mobile (no vertical overflow) AND serves as the
 *   340px right-hand playback panel on desktop.
 */
export function NowPlayingPanel({
  track,
  playlistLabel,
  isPlaying,
  isFavorite,
  position,
  duration,
  volume,
  shuffle,
  repeat,
  playlists,
  isMobileSheet = false,
  onCloseMobile,
  onOpenQueue,
  onTogglePlay,
  onPrev,
  onNext,
  onSeekChange,
  onSeekCommit,
  onVolumeChange,
  onToggleFavorite,
  onToggleShuffle,
  onCycleRepeat,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
}: NowPlayingPanelProps) {
  const [showAddMenu, setShowAddMenu] = useState(false)
  const effectiveDuration = duration > 0 ? duration : (track?.duration_secs ?? 0)
  const subtitle = track
    ? track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist
    : 'Select a track'

  return (
    <div className="flex h-full flex-col justify-between bg-card px-6 pb-6 pt-0 select-none">
      {/* Top Arch + Floating Transport Controls Pill */}
      <div className="relative">
        {/* Mobile top navigation controls flanking the arch */}
        {isMobileSheet && (
          <div className="absolute inset-x-0 top-4 z-20 flex items-center justify-between">
            <button
              onClick={onCloseMobile}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/85 text-foreground backdrop-blur-md cursor-pointer"
              aria-label="Minimize player"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={onOpenQueue}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/85 text-foreground backdrop-blur-md cursor-pointer"
              aria-label="Open queue"
            >
              <ListMusic className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mx-auto w-full max-w-[276px]">
          {/* Signature Inverted Arch Artwork */}
          <div className="h-[34dvh] max-h-[268px] min-h-[196px] w-full overflow-hidden rounded-b-[140px] border-x border-b border-border bg-secondary shadow-[inset_0_-12px_32px_rgba(0,0,0,0.45)]">
            <ArtworkTile
              trackId={track?.id}
              hasCover={track?.has_cover}
              seed={track?.title ?? 'zuno'}
              variant="arch"
            />
          </div>

          {/* Floating Transport Pill overlapping bottom of the Arch */}
          <div className="relative z-10 mx-auto -mt-9 flex h-[68px] w-[208px] items-center justify-between rounded-full border border-border bg-card px-4 shadow-[0_14px_32px_rgba(0,0,0,0.6)]">
            <button
              onClick={onPrev}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              aria-label="Previous"
            >
              <SkipBack className="h-4 w-4 fill-current" />
            </button>

            <button
              onClick={onTogglePlay}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95 cursor-pointer"
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
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              aria-label="Next"
            >
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          </div>
        </div>
      </div>

      {/* Middle: Playing-from context + Track Title */}
      <div className="mt-4 space-y-5">
        {/* Playing From row */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              PLAYING FROM
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-foreground">
              {playlistLabel}
            </p>
          </div>

          {!isMobileSheet && (
            <button
              onClick={onOpenQueue}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              title="View queue"
              aria-label="View queue"
            >
              <ListMusic className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Track Title + Artist + Favorite + Add-to-playlist */}
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            <h2 className="mt-0.5 truncate text-[22px] font-semibold leading-tight tracking-tight text-foreground">
              {track ? track.title : 'Not Playing'}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-1 pt-1">
            <button
              onClick={onToggleFavorite}
              disabled={!track}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 cursor-pointer',
                isFavorite
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              title={isFavorite ? 'Remove from Favorites' : 'Favorite'}
              aria-label="Toggle favorite"
            >
              <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
            </button>

            {track && (
              <button
                onClick={() => setShowAddMenu((v) => !v)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer',
                  showAddMenu && 'bg-secondary text-foreground',
                )}
                title="Add to playlist"
                aria-label="Add to playlist"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>

          {showAddMenu && track && (
            <div className="absolute top-10 right-0 z-30 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
              <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Add to playlist
              </p>
              {playlists.map((pl) => (
                <button
                  key={pl.slug}
                  onClick={() => {
                    onAddToPlaylist(pl.slug, track.id)
                    setShowAddMenu(false)
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-secondary cursor-pointer"
                >
                  <span className="truncate">{pl.title}</span>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {pl.track_ids.length}
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => {
                  setShowAddMenu(false)
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

      {/* Bottom: Scrubber + Mode & Volume Row */}
      <div className="mt-4 space-y-4">
        <div>
          <Slider
            value={position}
            max={effectiveDuration || 1}
            step={0.1}
            onChange={onSeekChange}
            onCommit={onSeekCommit}
            ariaLabel="Playback position"
            alwaysShowThumb
          />
          <div className="mt-1 flex items-center justify-between tabular-nums text-[11px] text-muted-foreground">
            <span>{formatTime(position)}</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* Shuffle, Repeat & Inline Volume */}
        <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-3.5">
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleShuffle}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                shuffle
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              title="Shuffle"
              aria-label="Shuffle"
            >
              <Shuffle className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onCycleRepeat}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                repeat !== 'off'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              title={`Repeat: ${repeat}`}
              aria-label="Repeat"
            >
              {repeat === 'one' ? (
                <Repeat1 className="h-3.5 w-3.5" />
              ) : (
                <Repeat className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <div className="flex flex-1 items-center gap-2 max-w-[150px]">
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
            />
          </div>
        </div>
      </div>
    </div>
  )
}
