import {
  Heart,
  ListMusic,
  Music,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Playlist } from '@/lib/zunoApi'

export type AppPage = 'home' | 'search' | 'playlist' | 'customize' | 'playing'

interface DesktopSidebarProps {
  page: AppPage
  activePlaylistSlug: string | null
  playlists: Playlist[]
  songCount: number
  onGoHome: () => void
  onGoSearch: () => void
  onOpenFavorites: () => void
  onOpenPlaylist: (slug: string) => void
  onGoCustomize: () => void
  onCreatePlaylist: () => void
  onRescan: () => void
}

/**
 * Full-height slim desktop navigation rail (shown >= 1024px).
 */
export function DesktopSidebar({
  page,
  activePlaylistSlug,
  playlists,
  songCount,
  onGoHome,
  onGoSearch,
  onOpenFavorites,
  onOpenPlaylist,
  onGoCustomize,
  onCreatePlaylist,
  onRescan,
}: DesktopSidebarProps) {
  const isFav =
    page === 'playlist' &&
    (activePlaylistSlug === 'favorites' || activePlaylistSlug === 'fav')

  return (
    <aside className="hidden w-[224px] shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex flex-1 flex-col overflow-y-auto px-3 py-5">
        {/* Brand */}
        <div className="mb-6 flex items-center justify-between px-2.5">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Zuno
          </span>
          <button
            onClick={onRescan}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
            title="Rescan library"
            aria-label="Rescan library"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Main Navigation */}
        <div className="space-y-0.5">
          <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            Library
          </p>
          <RailItem
            icon={Music}
            label="Songs"
            count={songCount}
            active={page === 'home'}
            onClick={onGoHome}
          />
          <RailItem
            icon={Search}
            label="Search"
            active={page === 'search'}
            onClick={onGoSearch}
          />
          <RailItem
            icon={Heart}
            label="Favorites"
            active={isFav}
            onClick={onOpenFavorites}
          />
          <RailItem
            icon={SlidersHorizontal}
            label="Customize"
            active={page === 'customize'}
            onClick={onGoCustomize}
          />
        </div>

        {/* Playlists */}
        <div className="mt-7 space-y-0.5">
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              Playlists
            </p>
            <button
              onClick={onCreatePlaylist}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              title="New playlist"
              aria-label="New playlist"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
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
                icon={ListMusic}
                label={pl.title}
                count={pl.track_ids.length}
                active={page === 'playlist' && activePlaylistSlug === pl.slug}
                onClick={() => onOpenPlaylist(pl.slug)}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  )
}

function RailItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Music
  label: string
  count?: number
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
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {typeof count === 'number' && (
        <span className="tabular-nums text-[11px] text-muted-foreground/60">
          {count}
        </span>
      )}
    </button>
  )
}
