import { LoaderCircle, Radio, RefreshCw, Square } from 'lucide-react'
import { ArtworkTile } from '@/components/ArtworkTile'
import { IconSwap, TextSwap } from '@/components/ui/motion'
import { Loader2 } from '@/components/PulseBarsLoader'
import { PulseHeart } from '@/components/PulseHeart'
import { VinylPlayButton, WaveformPlayButton } from '@/components/WaveformPlayButton'
import { ZunoIcon, type ZunoIconName } from '@/components/ZunoIcon'
import { cn } from '@/lib/utils'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Track } from '@/lib/zunoApi'
import type { AppPage } from '@/components/DesktopSidebar'

interface MobileDockProps {
  page: AppPage
  searchOpen: boolean
  track: Track | null
  isPlaying: boolean
  isFavorite: boolean
  isRadio?: boolean
  isBuffering?: boolean
  appearance: AppearanceSettings
  onTogglePlay: () => void
  onReconnectRadio?: () => void
  onDisconnectRadio?: () => void
  onToggleFavorite: () => void
  onExpandPlayer: () => void
  onNavigate: (page: AppPage) => void
  onOpenSearch: () => void
}

/**
 * Nested two-tier Mobile Dock:
 * - Upper tier: Integrated circular-cover mini player with PulseHeart & Play/Pause.
 * - Lower tier: 4-tab contrasting curved nav tray (Songs, Search, Recent, Playlists)
 *   where the active tab morphs into a top accent tick + bold label.
 */
export function MobileDock({
  page,
  searchOpen,
  track,
  isPlaying,
  isFavorite,
  isRadio = false,
  isBuffering = false,
  appearance,
  onTogglePlay,
  onReconnectRadio,
  onDisconnectRadio,
  onToggleFavorite,
  onExpandPlayer,
  onNavigate,
  onOpenSearch,
}: MobileDockProps) {
  const iconPack = appearance.iconPack

  const navItems: {
    id: string
    icon: ZunoIconName
    label: string
    active: boolean
    onClick: () => void
  }[] = [
    {
      id: 'home',
      icon: 'music',
      label: 'Songs',
      active: page === 'home' && !searchOpen,
      onClick: () => onNavigate('home'),
    },
    {
      id: 'search',
      icon: 'search',
      label: 'Search',
      active: searchOpen,
      onClick: onOpenSearch,
    },
    {
      id: 'recent',
      icon: 'clock',
      label: 'Recent',
      active: page === 'recent' && !searchOpen,
      onClick: () => onNavigate('recent'),
    },
    {
      id: 'playlists',
      icon: 'playlist',
      label: 'Playlists',
      active: (page === 'playlists' || page === 'playlist') && !searchOpen,
      onClick: () => onNavigate('playlists'),
    },
    {
      id: 'radio',
      icon: 'radio',
      label: 'FM',
      active: page === 'radio' && !searchOpen,
      onClick: () => onNavigate('radio'),
    },
  ]

  const artistLabel = track
    ? track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist
    : ''

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3.5 pb-[max(0.85rem,env(safe-area-inset-bottom))] lg:hidden">
      <div
        className={cn(
          'pointer-events-auto mx-auto w-full max-w-md overflow-hidden border border-border bg-card shadow-2xl transition-all duration-300',
          track ? 'rounded-[32px]' : 'rounded-[28px]',
        )}
      >
        {/* Upper Tier: Integrated Mini Player */}
        {track && (
          <div
            onClick={onExpandPlayer}
            className="relative flex items-center justify-between gap-3 px-4 pt-3.5 pb-3 cursor-pointer"
          >
            <div className="flex min-w-0 items-center gap-3">
              {/* Circular album artwork */}
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border bg-secondary shadow-sm">
                <ArtworkTile
                  trackId={track.id}
                  hasCover={track.has_cover}
                  seed={track.title}
                  variant="thumb"
                />
              </div>

              {/* Title + compact music-running bars + Artist */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TextSwap
                    as="p"
                    text={track.title}
                    className="min-w-0 truncate text-[14px] font-semibold leading-tight text-foreground"
                  />
                  {isPlaying && (
                    <Loader2
                      barCount={4}
                      height={13}
                      width={2}
                      gap={2}
                      speed={0.95}
                      className="shrink-0"
                    />
                  )}
                </div>
                <TextSwap
                  as="p"
                  text={artistLabel}
                  className="mt-0.5 truncate text-xs text-muted-foreground"
                />
              </div>
            </div>

            {/* PulseHeart Favorite + Circular Play/Pause */}
            <div
              className="flex shrink-0 items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <PulseHeart
                liked={isFavorite}
                iconPack={iconPack}
                onToggle={onToggleFavorite}
                className="h-9 w-9"
              />

              {isRadio ? (
                <>
                  {(isPlaying || isBuffering) && onDisconnectRadio && (
                    <button
                      type="button"
                      onClick={onDisconnectRadio}
                      aria-label="Disconnect FM"
                      className="t-press flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onReconnectRadio ?? onTogglePlay}
                    aria-label={isPlaying ? 'Reconnect FM' : 'Connect FM'}
                    className="t-press flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
                  >
                    {isBuffering ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : isPlaying ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <Radio className="h-4 w-4" />
                    )}
                  </button>
                </>
              ) : appearance.playButtonStyle === 'waveform' ? (
                <WaveformPlayButton
                  isPlaying={isPlaying}
                  onClick={onTogglePlay}
                  size="sm"
                />
              ) : appearance.playButtonStyle === 'vinyl' ? (
                <VinylPlayButton
                  isPlaying={isPlaying}
                  onClick={onTogglePlay}
                  size="sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="t-press flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-accent cursor-pointer"
                >
                  <IconSwap
                    active={isPlaying ? 'b' : 'a'}
                    iconA={
                      <ZunoIcon
                        name="play"
                        pack={iconPack}
                        filled
                        className="h-4 w-4 translate-x-[1px]"
                      />
                    }
                    iconB={
                      <ZunoIcon
                        name="pause"
                        pack={iconPack}
                        filled
                        className="h-4 w-4"
                      />
                    }
                  />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lower Tier: Nested Contrasting 4-Tab Curved Nav Tray */}
        <nav
          aria-label="Navigation"
          className="grid grid-cols-5 items-center rounded-[28px] bg-primary px-2.5 py-2.5 text-primary-foreground shadow-[0_-4px_20px_rgba(0,0,0,0.12)]"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              className="relative flex h-11 flex-col items-center justify-center rounded-2xl transition-transform active:scale-95 cursor-pointer"
            >
              {item.active ? (
                <span
                  key={`${item.id}-active`}
                  className="animate-dock-pop flex flex-col items-center justify-center gap-1"
                >
                  <span
                    className="h-1.5 w-[2.5px] rounded-full bg-primary-foreground/85"
                    aria-hidden="true"
                  />
                  <span className="text-[12px] font-semibold leading-none tracking-tight text-primary-foreground">
                    {item.label}
                  </span>
                </span>
              ) : (
                <span className="relative flex items-center justify-center text-primary-foreground/75 transition-all hover:scale-110 hover:text-primary-foreground">
                  <ZunoIcon
                    name={item.icon}
                    pack={iconPack}
                    filled={item.icon === 'heart'}
                    className="h-[19px] w-[19px]"
                  />
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
