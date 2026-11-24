import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { EaseThemeToggle } from '@/components/EaseThemeToggle'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { ZunoIcon, type ZunoIconName } from '@/components/ZunoIcon'
import { ZunoLogo } from '@/components/ZunoLogo'
import { cn } from '@/lib/utils'
import type {
  IconPackId,
  ThemeMode,
  ThemeToggleStyleId,
  ThemeTransitionId,
  ThemeTransitionStartId,
} from '@/lib/appearance'
import type { Playlist } from '@/lib/zunoApi'
import type { AppPage } from '@/components/DesktopSidebar'

interface MobileNavbarProps {
  page: AppPage
  activePlaylistSlug: string | null
  playlists: Playlist[]
  sourceCount: number
  eqEnabled: boolean
  eqLabel: string
  mode: ThemeMode
  themeTransition: ThemeTransitionId
  themeTransitionStart: ThemeTransitionStartId
  themeToggleStyle: ThemeToggleStyleId
  iconPack: IconPackId
  onToggleMode: () => void
  onGoHome: () => void
  onOpenSearch: () => void
  onGoEqualizer: () => void
  onGoCustomize: () => void
  onOpenFolders: () => void
  onOpenPlaylist: (slug: string) => void
  onCreatePlaylist: () => void
  onRescan: () => void
}

/**
 * Minimal Mobile Top Navbar (< 1024px) with:
 * - Zuno brand on the left
 * - Theme toggle button outside right next to the Navbar Menu button on the right
 * - Slide-over Open Menu containing Theme/Customize, Equalizer, Rescan, Search, and Playlists.
 */
export function MobileNavbar({
  page,
  activePlaylistSlug,
  playlists,
  sourceCount,
  eqEnabled,
  eqLabel,
  mode,
  themeTransition,
  themeTransitionStart,
  themeToggleStyle,
  iconPack,
  onToggleMode,
  onGoHome,
  onOpenSearch,
  onGoEqualizer,
  onGoCustomize,
  onOpenFolders,
  onOpenPlaylist,
  onCreatePlaylist,
  onRescan,
}: MobileNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const closeAnd = (fn: () => void) => {
    setMenuOpen(false)
    fn()
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2 text-[16px] font-semibold tracking-tight text-foreground cursor-pointer"
        >
          <ZunoLogo className="h-6 w-6" />
          <span>Zuno</span>
        </button>

        {/* Outside controls: Theme Toggle right next to the Navbar Menu button */}
        <div className="flex items-center gap-2">
          <EaseThemeToggle
            mode={mode}
            transition={themeTransition}
            transitionStart={themeTransitionStart}
            toggleStyle={themeToggleStyle}
            onToggle={onToggleMode}
            size="md"
          />

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary cursor-pointer',
              (page === 'customize' || page === 'equalizer') && 'border-primary/60',
            )}
          >
            {iconPack === 'skiper99' ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                className="zuno-icon zuno-pack-skiper99 h-4 w-4"
                aria-hidden="true"
              >
                <path className="zuno-skiper99-bar zuno-skiper99-bar-1" d="M4 7h16" />
                <path className="zuno-skiper99-bar zuno-skiper99-bar-2" d="M4 12h13" />
                <path className="zuno-skiper99-bar zuno-skiper99-bar-3" d="M4 17h10" />
              </svg>
            ) : (
              <Menu className="h-4 w-4" />
            )}
            {eqEnabled && (
              <span
                className="pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </header>

      {/* Slide-over Mobile Navbar Open Menu */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-xs lg:hidden"
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[min(82vw,300px)] flex-col border-l border-border bg-card shadow-2xl animate-dock-pop"
          >
            {/* Drawer Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <CompactScrollArea className="flex-1" viewportClassName="px-3 py-4">
              {/* Sound & Appearance */}
              <div className="space-y-1">
                <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  Studio &amp; Audio
                </p>

                <DrawerItem
                  icon="equalizer"
                  pack={iconPack}
                  label="Equalizer"
                  badge={eqEnabled ? eqLabel : 'Off'}
                  badgeActive={eqEnabled}
                  active={page === 'equalizer'}
                  onClick={() => closeAnd(onGoEqualizer)}
                />

                <DrawerItem
                  icon="customize"
                  pack={iconPack}
                  label="Theme & Customize"
                  active={page === 'customize'}
                  onClick={() => closeAnd(onGoCustomize)}
                />
              </div>

              {/* Quick Actions */}
              <div className="mt-6 space-y-1">
                <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  Library Tools
                </p>

                <DrawerItem
                  icon="search"
                  pack={iconPack}
                  label="Search songs"
                  onClick={() => closeAnd(onOpenSearch)}
                />

                <DrawerItem
                  icon="folder"
                  pack={iconPack}
                  label="Music folders"
                  badge={String(sourceCount)}
                  onClick={() => closeAnd(onOpenFolders)}
                />

                <DrawerItem
                  icon="refresh"
                  pack={iconPack}
                  label="Rescan library"
                  onClick={() => closeAnd(onRescan)}
                />
              </div>

              {/* Playlists */}
              <div className="mt-6 space-y-1">
                <div className="mb-1.5 flex items-center justify-between px-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                    Playlists
                  </p>
                  <button
                    type="button"
                    onClick={() => closeAnd(onCreatePlaylist)}
                    aria-label="New playlist"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
                  </button>
                </div>

                {playlists.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => closeAnd(onCreatePlaylist)}
                    className="w-full rounded-xl px-3 py-2 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    + New playlist
                  </button>
                ) : (
                  playlists.map((pl) => (
                    <DrawerItem
                      key={pl.slug}
                      icon="playlist"
                      pack={iconPack}
                      label={pl.title}
                      badge={String(pl.track_ids.length)}
                      active={page === 'playlist' && activePlaylistSlug === pl.slug}
                      onClick={() => closeAnd(() => onOpenPlaylist(pl.slug))}
                    />
                  ))
                )}
              </div>
            </CompactScrollArea>
          </aside>
        </div>
      )}
    </>
  )
}

function DrawerItem({
  icon,
  pack,
  label,
  badge,
  badgeActive = false,
  active = false,
  onClick,
}: {
  icon: ZunoIconName
  pack: IconPackId
  label: string
  badge?: string
  badgeActive?: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors cursor-pointer',
        active
          ? 'bg-secondary font-medium text-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <ZunoIcon
          name={icon}
          pack={pack}
          className={cn('h-4 w-4 shrink-0', active && 'text-primary')}
        />
        <span className="truncate">{label}</span>
      </span>
      {badge && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium tabular-nums',
            badgeActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground/75',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
