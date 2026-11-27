import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { EaseThemeToggle } from '@/components/EaseThemeToggle'
import { Tooltip } from '@/components/ui/tooltip'
import { ZunoIcon, type ZunoIconName } from '@/components/ZunoIcon'
import { ZunoLogo } from '@/components/ZunoLogo'
import { isFavoritesPlaylist } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  IconPackId,
  NavStyleId,
  ThemeMode,
  ThemeToggleStyleId,
  ThemeTransitionId,
  ThemeTransitionStartId,
} from '@/lib/appearance'
import type { Playlist } from '@/lib/zunoApi'
import type { AppPage } from '@/components/DesktopSidebar'

interface FloatingNavigationProps {
  navStyle: NavStyleId
  page: AppPage
  searchOpen: boolean
  activePlaylistSlug: string | null
  playlists: Playlist[]
  songCount: number
  recentCount: number
  sourceCount: number
  eqEnabled: boolean
  radioActive?: boolean
  mode: ThemeMode
  themeTransition: ThemeTransitionId
  themeTransitionStart: ThemeTransitionStartId
  themeToggleStyle: ThemeToggleStyleId
  iconPack: IconPackId
  scrollElementRef: React.RefObject<HTMLDivElement | null>
  onToggleMode: () => void
  onGoHome: () => void
  onGoRecent: () => void
  onGoRadio: () => void
  onOpenSearch: () => void
  onOpenFavorites: () => void
  onOpenPlaylistsHub: () => void
  onOpenPlaylist: (slug: string) => void
  onGoEqualizer: () => void
  onGoCustomize: () => void
  onOpenFolders: () => void
  onCreatePlaylist: () => void
  onRescan: () => void
  appVersion?: string
  updateAvailableVersion?: string | null
  onOpenUpdates?: () => void
}

/**
 * Alternative Desktop Navigation Themes:
 * - `floating-navbar` (SmoothUI Floating Navbar: detached pill with active dot & auto-hide on scroll)
 * - `floating-dock`   (Great UI Floating Dock Menu: morphing pill capsule + expandable playlists/tools panel)
 * - `floating-menu`   (Great UI Floating Capsule Menu: ultra-minimal pill expanding into full-canvas menu)
 */
export function FloatingNavigation({
  navStyle,
  page,
  searchOpen,
  activePlaylistSlug,
  playlists,
  songCount,
  recentCount,
  sourceCount,
  eqEnabled,
  radioActive = false,
  mode,
  themeTransition,
  themeTransitionStart,
  themeToggleStyle,
  iconPack,
  scrollElementRef,
  onToggleMode,
  onGoHome,
  onGoRecent,
  onGoRadio,
  onOpenSearch,
  onOpenFavorites,
  onOpenPlaylistsHub,
  onOpenPlaylist,
  onGoEqualizer,
  onGoCustomize,
  onOpenFolders,
  onCreatePlaylist,
  onRescan,
  appVersion,
  updateAvailableVersion,
  onOpenUpdates,
}: FloatingNavigationProps) {
  const [dockExpanded, setDockExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const navBarRef = useRef<HTMLDivElement>(null)

  // SmoothUI Floating Navbar: zero-rerender auto-hide on scroll down, instant reveal on scroll up
  useEffect(() => {
    if (navStyle !== 'floating-navbar') return
    const vp = scrollElementRef.current
    if (!vp) return
    let lastTop = vp.scrollTop
    const onScroll = () => {
      const cur = vp.scrollTop
      const el = navBarRef.current
      if (!el) return
      if (cur > 72 && cur - lastTop > 6) {
        el.dataset.hidden = 'true'
      } else if (cur < 40 || lastTop - cur > 4) {
        el.dataset.hidden = 'false'
      }
      lastTop = cur
    }
    vp.addEventListener('scroll', onScroll, { passive: true })
    return () => vp.removeEventListener('scroll', onScroll)
  }, [navStyle, scrollElementRef])

  useEffect(() => {
    if (!menuOpen && !dockExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setDockExpanded(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, dockExpanded])

  if (navStyle === 'sidebar') return null

  const isFav =
    page === 'playlist' &&
    Boolean(activePlaylistSlug && isFavoritesPlaylist({ slug: activePlaylistSlug }))

  const navItems: {
    id: string
    label: string
    icon: ZunoIconName
    active: boolean
    badge?: number | boolean
    onClick: () => void
  }[] = [
    {
      id: 'home',
      label: 'Songs',
      icon: 'music',
      active: page === 'home' && !searchOpen,
      badge: songCount,
      onClick: onGoHome,
    },
    {
      id: 'recent',
      label: 'Recent',
      icon: 'clock',
      active: page === 'recent' && !searchOpen,
      badge: recentCount > 0 ? recentCount : undefined,
      onClick: onGoRecent,
    },
    {
      id: 'search',
      label: 'Search',
      icon: 'search',
      active: searchOpen,
      onClick: onOpenSearch,
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: 'heart',
      active: isFav && !searchOpen,
      onClick: onOpenFavorites,
    },
    {
      id: 'playlists',
      label: 'Playlists',
      icon: 'playlist',
      active: (page === 'playlists' || (page === 'playlist' && !isFav)) && !searchOpen,
      badge: playlists.length > 0 ? playlists.length : undefined,
      onClick: onOpenPlaylistsHub,
    },
    {
      id: 'radio',
      label: 'FM Radio',
      icon: 'radio',
      active: page === 'radio' && !searchOpen,
      badge: radioActive,
      onClick: onGoRadio,
    },
    {
      id: 'equalizer',
      label: 'EQ',
      icon: 'equalizer',
      active: page === 'equalizer' && !searchOpen,
      badge: eqEnabled,
      onClick: onGoEqualizer,
    },
    {
      id: 'customize',
      label: 'Customize',
      icon: 'customize',
      active: page === 'customize' && !searchOpen,
      onClick: onGoCustomize,
    },
  ]

  // ── 1. SmoothUI Floating Navbar (detached pill bar with active dot & scroll reveal) ──
  if (navStyle === 'floating-navbar') {
    return (
      <div
        onMouseEnter={() => {
          if (navBarRef.current) navBarRef.current.dataset.hidden = 'false'
        }}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden justify-center px-4 pt-3 lg:flex"
      >
        <nav
          ref={navBarRef}
          data-hidden="false"
          aria-label="Primary navigation"
          className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5 shadow-xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[hidden=true]:-translate-y-16 data-[hidden=true]:opacity-0"
        >
          <button
            type="button"
            onClick={onGoHome}
            className="mr-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground cursor-pointer"
          >
            <ZunoLogo className="h-4 w-4" />
            <span>Zuno</span>
          </button>

          <span className="h-4 w-px bg-border" aria-hidden="true" />

          <div className="flex items-center gap-0.5 px-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                  item.active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                )}
              >
                <ZunoIcon name={item.icon} pack={iconPack} className="h-3.5 w-3.5" />
                <span>{item.label}</span>
                {item.active && (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>

          <span className="h-4 w-px bg-border" aria-hidden="true" />

          <div className="flex items-center gap-0.5 pl-1">
            <Tooltip label={`Music folders (${sourceCount})`} side="bottom">
              <button
                type="button"
                onClick={onOpenFolders}
                aria-label="Music folders"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <ZunoIcon name="folder" pack={iconPack} className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip label="Rescan library" side="bottom">
              <button
                type="button"
                onClick={onRescan}
                aria-label="Rescan library"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <ZunoIcon name="refresh" pack={iconPack} className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            {onOpenUpdates && updateAvailableVersion && (
              <Tooltip label={`Update v${updateAvailableVersion} available`} side="bottom">
                <button
                  type="button"
                  onClick={onOpenUpdates}
                  className="t-press rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground cursor-pointer"
                >
                  v{updateAvailableVersion}
                </button>
              </Tooltip>
            )}
            <EaseThemeToggle
              mode={mode}
              transition={themeTransition}
              transitionStart={themeTransitionStart}
              toggleStyle={themeToggleStyle}
              onToggle={onToggleMode}
              size="sm"
            />
          </div>
        </nav>
      </div>
    )
  }

  // ── 2. Great UI Floating Dock Menu (morphing capsule dock + expandable playlists/tools drawer) ──
  if (navStyle === 'floating-dock') {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 hidden flex-col items-center px-4 lg:flex">
        <div className="pointer-events-auto relative flex flex-col items-center">
          <nav
            aria-label="Floating dock navigation"
            className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-xl"
          >
            {navItems.slice(0, 7).map((item) => (
              <Tooltip key={item.id} label={item.label} side="bottom">
                <button
                  type="button"
                  onClick={() => {
                    setDockExpanded(false)
                    item.onClick()
                  }}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-all duration-200 cursor-pointer',
                    item.active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <ZunoIcon name={item.icon} pack={iconPack} className="h-3.5 w-3.5 shrink-0" />
                  {item.active && <span>{item.label}</span>}
                </button>
              </Tooltip>
            ))}

            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setDockExpanded((v) => !v)}
              aria-expanded={dockExpanded}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors cursor-pointer',
                dockExpanded
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <span>Studio</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  dockExpanded && 'rotate-180',
                )}
              />
            </button>
          </nav>

          {/* Expandable Morphing Dock Submenu */}
          {dockExpanded && (
            <div className="mt-2 w-[340px] rounded-2xl border border-border bg-card p-3 shadow-2xl animate-dock-pop">
              <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                <div className="flex items-center gap-2">
                  <ZunoLogo className="h-4 w-4" />
                  <span className="text-xs font-semibold text-foreground">Quick Actions</span>
                </div>
                <div className="flex items-center gap-1">
                  <EaseThemeToggle
                    mode={mode}
                    transition={themeTransition}
                    transitionStart={themeTransitionStart}
                    toggleStyle={themeToggleStyle}
                    onToggle={onToggleMode}
                    size="sm"
                  />
                  <Tooltip label="Rescan library" side="bottom">
                    <button
                      type="button"
                      onClick={() => {
                        setDockExpanded(false)
                        onRescan()
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                      <ZunoIcon name="refresh" pack={iconPack} className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  {onOpenUpdates && (
                    <button
                      type="button"
                      onClick={() => {
                        setDockExpanded(false)
                        onOpenUpdates()
                      }}
                      className={cn(
                        't-press rounded-full px-2 py-1 text-[10.5px] font-medium cursor-pointer',
                        updateAvailableVersion
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                    >
                      {updateAvailableVersion ? `v${updateAvailableVersion}` : 'Updates'}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDockExpanded(false)
                    onGoCustomize()
                  }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer"
                >
                  <ZunoIcon name="customize" pack={iconPack} className="h-3.5 w-3.5 text-primary" />
                  <span>Customize</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDockExpanded(false)
                    onOpenFolders()
                  }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer"
                >
                  <ZunoIcon name="folder" pack={iconPack} className="h-3.5 w-3.5 text-primary" />
                  <span>Folders ({sourceCount})</span>
                </button>
              </div>

              <div className="mt-3 space-y-1 border-t border-border/70 pt-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Playlists
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDockExpanded(false)
                      onCreatePlaylist()
                    }}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    + New
                  </button>
                </div>
                {playlists.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-muted-foreground">No playlists yet</p>
                ) : (
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {playlists.map((pl) => (
                      <button
                        key={pl.slug}
                        type="button"
                        onClick={() => {
                          setDockExpanded(false)
                          onOpenPlaylist(pl.slug)
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                      >
                        <span className="truncate">{pl.title}</span>
                        <span className="tabular-nums text-[10.5px] opacity-70">
                          {pl.track_ids.length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 3. Great UI Floating Capsule Menu (minimal pill expanding into full-canvas menu overlay) ──
  return (
    <>
      <div className="pointer-events-none absolute top-3.5 left-5 z-20 hidden items-center gap-2 lg:flex">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground shadow-lg transition-all hover:bg-secondary active:scale-95 cursor-pointer"
        >
          <ZunoLogo className="h-4 w-4" />
          <span>Zuno</span>
          <span className="h-3.5 w-px bg-border" aria-hidden="true" />
          <Menu className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <div className="pointer-events-auto">
          <EaseThemeToggle
            mode={mode}
            transition={themeTransition}
            transitionStart={themeTransitionStart}
            toggleStyle={themeToggleStyle}
            onToggle={onToggleMode}
            size="md"
          />
        </div>
      </div>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="absolute inset-0 z-50 hidden items-center justify-center bg-background/95 p-8 animate-dock-pop lg:flex"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <div className="flex items-center gap-2.5">
                <ZunoLogo className="h-6 w-6" />
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Zuno</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {songCount} songs · {sourceCount} {sourceCount === 1 ? 'folder' : 'folders'}
                  </p>
                </div>
              </div>

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
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-6">
              {/* Left: Staggered Primary Sections */}
              <div className="space-y-1">
                <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Navigation
                </p>
                {navItems.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    style={{ animationDelay: `${idx * 25}ms` }}
                    onClick={() => {
                      setMenuOpen(false)
                      item.onClick()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors animate-dock-pop cursor-pointer',
                      item.active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary',
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <ZunoIcon name={item.icon} pack={iconPack} className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && (
                      <span className="font-mono text-xs opacity-70">{item.badge}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Right: Playlists & Tools */}
              <div className="flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Playlists
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onCreatePlaylist()
                      }}
                      className="text-xs font-medium text-primary hover:underline cursor-pointer"
                    >
                      + New
                    </button>
                  </div>

                  {playlists.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No playlists yet.</p>
                  ) : (
                    <div className="max-h-52 space-y-1 overflow-y-auto">
                      {playlists.map((pl) => (
                        <button
                          key={pl.slug}
                          type="button"
                          onClick={() => {
                            setMenuOpen(false)
                            onOpenPlaylist(pl.slug)
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                        >
                          <span className="truncate">{pl.title}</span>
                          <span className="tabular-nums opacity-70">{pl.track_ids.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onOpenFolders()
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer"
                  >
                    <ZunoIcon name="folder" pack={iconPack} className="h-3.5 w-3.5" />
                    <span>Folders</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onRescan()
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer"
                  >
                    <ZunoIcon name="refresh" pack={iconPack} className="h-3.5 w-3.5" />
                    <span>Rescan</span>
                  </button>
                  {onOpenUpdates && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onOpenUpdates()
                      }}
                      className={cn(
                        'col-span-2 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer',
                        updateAvailableVersion
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:bg-secondary',
                      )}
                    >
                      <span>
                        {updateAvailableVersion
                          ? `Update · v${updateAvailableVersion}`
                          : appVersion
                            ? `Updates · v${appVersion}`
                            : 'Updates'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
