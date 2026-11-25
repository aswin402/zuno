import { ArrowUpCircle } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { EaseThemeToggle } from '@/components/EaseThemeToggle'
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

export type AppPage =
  | 'home'
  | 'recent'
  | 'playlists'
  | 'playlist'
  | 'radio'
  | 'equalizer'
  | 'customize'
  | 'playing'

interface DesktopSidebarProps {
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
  onToggleMode: () => void
  onGoHome: () => void
  onGoRecent: () => void
  onGoRadio: () => void
  onOpenSearch: () => void
  onOpenFavorites: () => void
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
 * Full-height seamless desktop navigation rail (`h-full`, zero bottom gap)
 * with quick Dark/Light mode toggle and dynamic multi-pack icons.
 */
export function DesktopSidebar({
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
  onToggleMode,
  onGoHome,
  onGoRecent,
  onGoRadio,
  onOpenSearch,
  onOpenFavorites,
  onOpenPlaylist,
  onGoEqualizer,
  onGoCustomize,
  onOpenFolders,
  onCreatePlaylist,
  onRescan,
  appVersion,
  updateAvailableVersion,
  onOpenUpdates,
}: DesktopSidebarProps) {
  const isFav =
    page === 'playlist' &&
    (activePlaylistSlug === 'favorites' || activePlaylistSlug === 'fav')

  return (
    <aside className="hidden h-full w-[224px] shrink-0 flex-col border-r border-border bg-card lg:flex">
      <CompactScrollArea className="flex-1" viewportClassName="px-3 py-5">
        <div className="flex flex-col">
        {/* Brand + Theme Toggle + Rescan */}
        <div className="mb-6 flex items-center justify-between px-2.5">
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground cursor-pointer"
          >
            <ZunoLogo className="h-[22px] w-[22px]" />
            <span>Zuno</span>
          </button>
          <div className="flex items-center gap-0.5">
            <Tooltip
              label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              side="bottom"
            >
              <EaseThemeToggle
                mode={mode}
                transition={themeTransition}
                transitionStart={themeTransitionStart}
                toggleStyle={themeToggleStyle}
                onToggle={onToggleMode}
                size="sm"
              />
            </Tooltip>

            <Tooltip label={`Music folders (${sourceCount})`} side="bottom">
              <button
                onClick={onOpenFolders}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                aria-label="Music folders"
              >
                <ZunoIcon name="folder" pack={iconPack} className="h-3.5 w-3.5" />
              </button>
            </Tooltip>

            <Tooltip label="Rescan library" side="bottom">
              <button
                onClick={onRescan}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                aria-label="Rescan library"
              >
                <ZunoIcon name="refresh" pack={iconPack} className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Main Navigation */}
        <div className="space-y-0.5">
          <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            Library
          </p>
          <RailItem
            icon="music"
            pack={iconPack}
            label="Songs"
            count={songCount}
            active={page === 'home' && !searchOpen}
            onClick={onGoHome}
          />
          <RailItem
            icon="clock"
            pack={iconPack}
            label="Last Played"
            count={recentCount > 0 ? recentCount : undefined}
            active={page === 'recent' && !searchOpen}
            onClick={onGoRecent}
          />
          <RailItem
            icon="search"
            pack={iconPack}
            label="Search"
            active={searchOpen}
            onClick={onOpenSearch}
          />
          <RailItem
            icon="heart"
            pack={iconPack}
            label="Favorites"
            active={isFav && !searchOpen}
            onClick={onOpenFavorites}
          />
          <RailItem
            icon="radio"
            pack={iconPack}
            label="FM Radio"
            dot={radioActive}
            active={page === 'radio' && !searchOpen}
            onClick={onGoRadio}
          />
          <RailItem
            icon="equalizer"
            pack={iconPack}
            label="Equalizer"
            dot={eqEnabled}
            active={page === 'equalizer' && !searchOpen}
            onClick={onGoEqualizer}
          />
          <RailItem
            icon="customize"
            pack={iconPack}
            label="Customize"
            active={page === 'customize' && !searchOpen}
            onClick={onGoCustomize}
          />
        </div>

        {/* Playlists */}
        <div className="mt-7 space-y-0.5">
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              Playlists
            </p>
            <Tooltip label="New playlist" side="top">
              <button
                onClick={onCreatePlaylist}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                aria-label="New playlist"
              >
                <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>

          {playlists.length === 0 ? (
            <button
              onClick={onCreatePlaylist}
              className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground/70 hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              + New playlist
            </button>
          ) : (
            playlists.map((pl) => (
              <RailItem
                key={pl.slug}
                icon="playlist"
                pack={iconPack}
                label={pl.title}
                count={pl.track_ids.length}
                active={page === 'playlist' && activePlaylistSlug === pl.slug}
                onClick={() => onOpenPlaylist(pl.slug)}
              />
            ))
          )}
        </div>
        </div>
      </CompactScrollArea>

      {/* Bottom Version & Update Status Footer */}
      {onOpenUpdates && (
        <div className="shrink-0 border-t border-border/70 px-3 py-2.5">
          <button
            type="button"
            onClick={onOpenUpdates}
            className={cn(
              't-press flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer',
              updateAvailableVersion
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {updateAvailableVersion
                  ? `Update v${updateAvailableVersion}`
                  : 'Updates & Backup'}
              </span>
            </span>
            {appVersion && !updateAvailableVersion && (
              <span className="font-mono text-[10px] opacity-65">v{appVersion}</span>
            )}
          </button>
        </div>
      )}
    </aside>
  )
}

function RailItem({
  icon,
  pack,
  label,
  count,
  dot = false,
  active,
  onClick,
}: {
  icon: ZunoIconName
  pack: IconPackId
  label: string
  count?: number
  dot?: boolean
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer',
        active
          ? 'bg-secondary font-medium text-foreground'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <ZunoIcon name={icon} pack={pack} className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {typeof count === 'number' ? (
        <span className="tabular-nums text-[11px] text-muted-foreground/60">
          {count}
        </span>
      ) : dot ? (
        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
      ) : null}
    </button>
  )
}
