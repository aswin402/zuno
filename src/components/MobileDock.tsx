import { ArtworkTile } from '@/components/ArtworkTile'
import { PulseHeart } from '@/components/PulseHeart'
import { WaveformPlayButton } from '@/components/WaveformPlayButton'
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
  progressPct: number
  isFavoritesActive: boolean
  eqEnabled?: boolean
  appearance: AppearanceSettings
  onTogglePlay: () => void
  onToggleFavorite: () => void
  onExpandPlayer: () => void
  onNavigate: (page: AppPage) => void
  onOpenSearch: () => void
  onOpenFavorites: () => void
}

/**
 * Nested two-tier Mobile Dock:
 * - Upper tier: Integrated circular-cover mini player with PulseHeart & Play/Pause + hairline progress seam.
 * - Lower tier: Contrasting curved nav tray where the active tab morphs into a top accent tick + bold label.
 */
export function MobileDock({
  page,
  searchOpen,
  track,
  isPlaying,
  isFavorite,
  progressPct,
  isFavoritesActive,
  eqEnabled = false,
  appearance,
  onTogglePlay,
  onToggleFavorite,
  onExpandPlayer,
  onNavigate,
  onOpenSearch,
  onOpenFavorites,
}: MobileDockProps) {
  const iconPack = appearance.iconPack

  const navItems: {
    id: string
    icon: ZunoIconName
    label: string
    active: boolean
    dot?: boolean
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
      id: 'favorites',
      icon: 'heart',
      label: 'Favorites',
      active: isFavoritesActive && !searchOpen,
      onClick: onOpenFavorites,
    },
    {
      id: 'equalizer',
      icon: 'equalizer',
      label: 'EQ',
      active: page === 'equalizer' && !searchOpen,
      dot: eqEnabled,
      onClick: () => onNavigate('equalizer'),
    },
    {
      id: 'customize',
      icon: 'customize',
      label: 'Style',
      active: page === 'customize' && !searchOpen,
      onClick: () => onNavigate('customize'),
    },
  ]

  const artistLabel = track
    ? track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist
    : ''

  return (
    <div className="shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent px-3.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <div
        className={cn(
          'mx-auto w-full max-w-md overflow-hidden border border-border bg-card shadow-2xl transition-all duration-300',
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

              {/* Title + Artist */}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold leading-tight text-foreground">
                  {track.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {artistLabel}
                </p>
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

              {appearance.playButtonStyle === 'waveform' ? (
                <WaveformPlayButton
                  isPlaying={isPlaying}
                  onClick={onTogglePlay}
                  size="sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground transition-all hover:bg-accent active:scale-95 cursor-pointer"
                >
                  <ZunoIcon
                    name={isPlaying ? 'pause' : 'play'}
                    pack={iconPack}
                    filled
                    className={cn(
                      'h-4 w-4',
                      !isPlaying && 'translate-x-[1px]',
                    )}
                  />
                </button>
              )}
            </div>

            {/* Subtle progress hairline along seam */}
            <div className="pointer-events-none absolute inset-x-6 bottom-0 h-[2px] overflow-hidden rounded-full bg-accent/60">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          </div>
        )}

        {/* Lower Tier: Nested Contrasting Curved Nav Tray */}
        <nav
          aria-label="Navigation"
          className="grid grid-cols-5 items-center rounded-[28px] bg-primary px-2 py-2.5 text-primary-foreground shadow-[0_-4px_20px_rgba(0,0,0,0.12)]"
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
                  {item.dot && (
                    <span
                      className="pointer-events-none absolute -top-1 -right-1.5 h-1.5 w-1.5 rounded-full bg-primary-foreground"
                      aria-hidden="true"
                    />
                  )}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
