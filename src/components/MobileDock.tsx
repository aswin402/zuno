import {
  Heart,
  Music,
  Pause,
  Play,
  Search,
  SkipForward,
  SlidersHorizontal,
} from 'lucide-react'
import { ArtworkTile } from '@/components/ArtworkTile'
import { cn } from '@/lib/utils'
import type { Track } from '@/lib/zunoApi'
import type { AppPage } from '@/components/DesktopSidebar'

interface MobileDockProps {
  page: AppPage
  track: Track | null
  isPlaying: boolean
  progressPct: number
  isFavoritesActive: boolean
  onTogglePlay: () => void
  onNext: () => void
  onExpandPlayer: () => void
  onNavigate: (page: AppPage) => void
  onOpenFavorites: () => void
}

/**
 * Compact, native-feeling Android/mobile bottom dock (< 1024px):
 * Floating Mini Player capsule + floating pill navigation.
 */
export function MobileDock({
  page,
  track,
  isPlaying,
  progressPct,
  isFavoritesActive,
  onTogglePlay,
  onNext,
  onExpandPlayer,
  onNavigate,
  onOpenFavorites,
}: MobileDockProps) {
  const navItems = [
    {
      id: 'home',
      icon: Music,
      label: 'Songs',
      active: page === 'home',
      onClick: () => onNavigate('home'),
    },
    {
      id: 'search',
      icon: Search,
      label: 'Search',
      active: page === 'search',
      onClick: () => onNavigate('search'),
    },
    {
      id: 'favorites',
      icon: Heart,
      label: 'Favorites',
      active: isFavoritesActive,
      onClick: onOpenFavorites,
    },
    {
      id: 'customize',
      icon: SlidersHorizontal,
      label: 'Customize',
      active: page === 'customize',
      onClick: () => onNavigate('customize'),
    },
  ]

  return (
    <div className="shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-md flex-col gap-2.5">
        {track && (
          <div
            onClick={onExpandPlayer}
            className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lg cursor-pointer"
          >
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border">
                  <ArtworkTile
                    trackId={track.id}
                    hasCover={track.has_cover}
                    seed={track.title}
                    variant="thumb"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {track.title}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {track.artist === 'Unknown Artist' && track.folder
                      ? track.folder
                      : track.artist}
                  </p>
                </div>
              </div>

              <div
                className="flex shrink-0 items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={onTogglePlay}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Play className="h-3.5 w-3.5 translate-x-[0.5px] fill-current" />
                  )}
                </button>
                <button
                  onClick={onNext}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label="Next"
                >
                  <SkipForward className="h-4 w-4 fill-current" />
                </button>
              </div>
            </div>

            <div className="h-[2px] w-full bg-accent">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          </div>
        )}

        <nav
          aria-label="Navigation"
          className="mx-auto flex h-[50px] items-center gap-3 rounded-full border border-border bg-card/95 px-3 shadow-xl backdrop-blur-md"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                aria-label={item.label}
                title={item.label}
                className={cn(
                  'flex h-9 w-11 items-center justify-center rounded-full transition-colors cursor-pointer',
                  item.active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
