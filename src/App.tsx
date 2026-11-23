import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DesktopSidebar, type AppPage } from '@/components/DesktopSidebar'
import { DesktopPlayerBar } from '@/components/DesktopPlayerBar'
import { NowPlayingPanel } from '@/components/NowPlayingPanel'
import { MobileDock } from '@/components/MobileDock'
import { HomePage } from '@/pages/HomePage'
import { PlaylistPage } from '@/pages/PlaylistPage'
import { SearchPage } from '@/pages/SearchPage'
import { CustomizePage } from '@/pages/CustomizePage'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  applyAppearanceToDom,
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  type AppearanceSettings,
} from '@/lib/appearance'
import type { SortDir, SortField } from '@/lib/sortTracks'
import {
  zunoApi,
  type FolderSummary,
  type Playlist,
  type RepeatMode,
  type Track,
} from '@/lib/zunoApi'

type ListContext =
  | { kind: 'all' }
  | { kind: 'folder'; name: string }
  | { kind: 'playlist'; slug: string }

const LAST_PLAYED_KEY = 'zuno:last_played'
const SORT_PREF_KEY = 'zuno:sort_pref'

const VALID_SORT_FIELDS: SortField[] = [
  'name',
  'artist',
  'album',
  'time',
  'size',
  'duration',
]

function loadLastPlayed(): string[] {
  try {
    const raw = localStorage.getItem(LAST_PLAYED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

function loadSortPref(): { field: SortField; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_PREF_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const mapped =
        parsed?.field === 'title'
          ? 'name'
          : parsed?.field === 'date'
            ? 'time'
            : parsed?.field
      if (
        VALID_SORT_FIELDS.includes(mapped) &&
        (parsed?.dir === 'asc' || parsed?.dir === 'desc')
      ) {
        return { field: mapped, dir: parsed.dir }
      }
    }
  } catch {
    /* ignore */
  }
  return { field: 'name', dir: 'asc' }
}

function shuffleIds(ids: string[], keepFirstId?: string): string[] {
  const pool = ids.filter((id) => id !== keepFirstId)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return keepFirstId ? [keepFirstId, ...pool] : pool
}

export default function App() {
  const [page, setPage] = useState<AppPage>('home')
  const [mobilePlayerOpen, setMobilePlayerOpen] = useState(false)
  const [listCtx, setListCtx] = useState<ListContext>({ kind: 'all' })
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance)

  const [tracks, setTracks] = useState<Track[]>([])
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [lastPlayedIds, setLastPlayedIds] = useState<string[]>(loadLastPlayed)
  const [sortPref, setSortPref] = useState<{ field: SortField; dir: SortDir }>(
    loadSortPref,
  )
  const [playlistSort, setPlaylistSort] = useState<{
    field: SortField
    dir: SortDir
  }>({
    field: 'default',
    dir: 'asc',
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Track[] | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [queueIds, setQueueIds] = useState<string[]>([])
  const [baseQueueIds, setBaseQueueIds] = useState<string[]>([])
  const [queueIndex, setQueueIndex] = useState<number | null>(null)
  const [activePlaylistLabel, setActivePlaylistLabel] = useState<string>('Songs')
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createInitialTrackId, setCreateInitialTrackId] = useState<
    string | undefined
  >()

  const trackById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t])),
    [tracks],
  )
  const notify = useCallback((msg: string) => setToast(msg), [])

  // Apply appearance CSS custom properties live whenever settings change
  useEffect(() => {
    applyAppearanceToDom(appearance)
    saveAppearance(appearance)
  }, [appearance])

  const updateAppearance = useCallback((patch: Partial<AppearanceSettings>) => {
    setAppearance((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetAppearance = useCallback(() => {
    setAppearance(DEFAULT_APPEARANCE)
    notify('Restored default style')
  }, [notify])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const refreshLibrary = useCallback(async () => {
    try {
      const [songRes, folderRes, plRes] = await Promise.all([
        zunoApi.listSongs(),
        zunoApi.listFolders(),
        zunoApi.listPlaylists(),
      ])
      setTracks(songRes.tracks)
      setFolders(folderRes)
      setPlaylists(plRes)
    } catch {
      /* backend offline */
    }
  }, [])

  useEffect(() => {
    refreshLibrary()
  }, [refreshLibrary])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await zunoApi.searchSongs(q)
        setSearchResults(res.tracks)
      } catch {
        setSearchResults([])
      }
    }, 90)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const currentTrack: Track | null = useMemo(() => {
    if (queueIndex === null) return null
    const id = queueIds[queueIndex]
    return id ? (trackById.get(id) ?? null) : null
  }, [queueIndex, queueIds, trackById])

  const lastPlayedTracks = useMemo(
    () =>
      lastPlayedIds
        .map((id) => trackById.get(id))
        .filter((t): t is Track => Boolean(t))
        .slice(0, 6),
    [lastPlayedIds, trackById],
  )

  const recordPlayed = useCallback((id: string) => {
    setLastPlayedIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 10)
      try {
        localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const effectiveDuration =
    duration > 0 ? duration : (currentTrack?.duration_secs ?? 0)
  const progressPct =
    effectiveDuration > 0 ? (position / effectiveDuration) * 100 : 0

  const favoritesPlaylist = useMemo(
    () =>
      playlists.find((p) => p.slug === 'favorites' || p.slug === 'fav') ?? null,
    [playlists],
  )

  const isCurrentFavorite = useMemo(() => {
    if (!currentTrack || !favoritesPlaylist) return false
    return favoritesPlaylist.track_ids.includes(currentTrack.id)
  }, [currentTrack, favoritesPlaylist])

  const playTrackById = useCallback(
    (id: string) => {
      const el = audioRef.current
      if (!el) return
      const url = zunoApi.audioUrl(id)
      if (el.getAttribute('data-track-id') !== id) {
        el.setAttribute('data-track-id', id)
        el.src = url
      }
      recordPlayed(id)
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    },
    [recordPlayed],
  )

  const startQueue = useCallback(
    (ids: string[], startId?: string, label = 'Songs', forceShuffle?: boolean) => {
      if (ids.length === 0) return
      const useShuffle = forceShuffle ?? shuffle
      if (forceShuffle !== undefined) setShuffle(forceShuffle)
      const ordered = useShuffle ? shuffleIds(ids, startId) : ids
      const idx = startId ? Math.max(0, ordered.indexOf(startId)) : 0
      setBaseQueueIds(ids)
      setQueueIds(ordered)
      setQueueIndex(idx)
      setActivePlaylistLabel(label)
      setPosition(0)
      playTrackById(ordered[idx])
    },
    [shuffle, playTrackById],
  )

  const handleTogglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (!currentTrack) {
      if (tracks.length > 0) {
        startQueue(
          tracks.map((t) => t.id),
          tracks[0].id,
          'Songs',
        )
      }
      return
    }
    if (el.paused) {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => {})
    } else {
      el.pause()
      setIsPlaying(false)
    }
  }, [currentTrack, tracks, startQueue])

  const handleNext = useCallback(
    (autoAdvance = false) => {
      if (queueIds.length === 0 || queueIndex === null) return
      if (autoAdvance && repeat === 'one') {
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          audioRef.current.play().catch(() => {})
        }
        return
      }
      if (queueIndex + 1 < queueIds.length) {
        const nextIdx = queueIndex + 1
        setQueueIndex(nextIdx)
        playTrackById(queueIds[nextIdx])
      } else if (repeat === 'all') {
        setQueueIndex(0)
        playTrackById(queueIds[0])
      } else {
        setIsPlaying(false)
      }
    },
    [queueIds, queueIndex, repeat, playTrackById],
  )

  const handlePrev = useCallback(() => {
    if (queueIds.length === 0 || queueIndex === null) return
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      setPosition(0)
      return
    }
    const prevIdx =
      queueIndex > 0 ? queueIndex - 1 : repeat === 'all' ? queueIds.length - 1 : 0
    setQueueIndex(prevIdx)
    playTrackById(queueIds[prevIdx])
  }, [queueIds, queueIndex, repeat, playTrackById])

  const handleSeekCommit = useCallback((secs: number) => {
    if (audioRef.current) audioRef.current.currentTime = secs
  }, [])

  const handleToggleShuffle = useCallback(() => {
    const next = !shuffle
    setShuffle(next)
    if (baseQueueIds.length > 0) {
      const curId = queueIndex !== null ? queueIds[queueIndex] : undefined
      if (next) {
        setQueueIds(shuffleIds(baseQueueIds, curId))
        setQueueIndex(0)
      } else {
        setQueueIds(baseQueueIds)
        setQueueIndex(curId ? Math.max(0, baseQueueIds.indexOf(curId)) : 0)
      }
    }
  }, [shuffle, baseQueueIds, queueIds, queueIndex])

  const handleCycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
      if (!inInput && e.code === 'Space') {
        e.preventDefault()
        handleTogglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleTogglePlay])

  async function handleRescan() {
    try {
      const msg = await zunoApi.rescan()
      await refreshLibrary()
      notify(msg)
    } catch (err) {
      notify(String(err))
    }
  }

  async function handleToggleFavorite() {
    if (!currentTrack) return
    try {
      if (!favoritesPlaylist) {
        await zunoApi.createPlaylist('Favorites', [currentTrack.id])
        notify('Added to Favorites')
      } else if (isCurrentFavorite) {
        await zunoApi.removeFromPlaylist(favoritesPlaylist.slug, currentTrack.id)
        notify('Removed from Favorites')
      } else {
        await zunoApi.addToPlaylist(favoritesPlaylist.slug, [currentTrack.id])
        notify('Added to Favorites')
      }
      await refreshLibrary()
    } catch (err) {
      notify(String(err))
    }
  }

  async function handleCreatePlaylistSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = createName.trim()
    if (!name) return
    try {
      const created = await zunoApi.createPlaylist(
        name,
        createInitialTrackId ? [createInitialTrackId] : [],
      )
      setCreateOpen(false)
      setCreateName('')
      setCreateInitialTrackId(undefined)
      await refreshLibrary()
      setListCtx({ kind: 'playlist', slug: created.playlist.slug })
      setPlaylistSort({ field: 'default', dir: 'asc' })
      setPage('playlist')
      notify(`Created ${created.playlist.title}`)
    } catch (err) {
      notify(String(err))
    }
  }

  async function handleAddToPlaylist(slug: string, trackId: string) {
    try {
      await zunoApi.addToPlaylist(slug, [trackId])
      await refreshLibrary()
      notify('Added to playlist')
    } catch (err) {
      notify(String(err))
    }
  }

  async function handleRemoveFromPlaylist(slug: string, trackId: string) {
    try {
      await zunoApi.removeFromPlaylist(slug, trackId)
      await refreshLibrary()
      notify('Removed from playlist')
    } catch (err) {
      notify(String(err))
    }
  }

  async function handleDeletePlaylist(slug: string) {
    try {
      await zunoApi.deletePlaylist(slug)
      await refreshLibrary()
      setListCtx({ kind: 'all' })
      setPage('home')
      notify('Playlist deleted')
    } catch (err) {
      notify(String(err))
    }
  }

  const activeListMeta = useMemo(() => {
    if (listCtx.kind === 'playlist') {
      const pl = playlists.find((p) => p.slug === listCtx.slug)
      if (pl) {
        const list = pl.track_ids
          .map((id) => trackById.get(id))
          .filter((t): t is Track => Boolean(t))
        return {
          overline: 'PLAYLIST',
          title: pl.title,
          tracks: list,
          playlistSlug: pl.slug,
        }
      }
    }
    if (listCtx.kind === 'folder') {
      const list =
        listCtx.name === '(root)'
          ? tracks.filter((t) => !t.folder)
          : tracks.filter(
              (t) =>
                t.folder === listCtx.name ||
                t.folder.startsWith(`${listCtx.name}/`),
            )
      return {
        overline: 'FOLDER',
        title: listCtx.name,
        tracks: list,
        playlistSlug: null,
      }
    }
    return {
      overline: 'LIBRARY',
      title: 'Songs',
      tracks,
      playlistSlug: null,
    }
  }, [listCtx, playlists, tracks, trackById])

  const openFavoritesPage = useCallback(() => {
    setMobilePlayerOpen(false)
    if (favoritesPlaylist) {
      setListCtx({ kind: 'playlist', slug: favoritesPlaylist.slug })
      setPlaylistSort({ field: 'default', dir: 'asc' })
      setPage('playlist')
    } else {
      setCreateName('Favorites')
      setCreateInitialTrackId(undefined)
      setCreateOpen(true)
    }
  }, [favoritesPlaylist])

  const isFavoritesActive =
    page === 'playlist' &&
    listCtx.kind === 'playlist' &&
    (listCtx.slug === 'favorites' || listCtx.slug === 'fav')

  const isCustomPlaylist = Boolean(activeListMeta.playlistSlug)
  const currentPlaylistSort = isCustomPlaylist ? playlistSort : sortPref

  function handleMainSortChange(field: SortField, dir: SortDir) {
    const next = { field, dir }
    setSortPref(next)
    try {
      localStorage.setItem(SORT_PREF_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function handlePlaylistSortChange(field: SortField, dir: SortDir) {
    if (isCustomPlaylist) {
      setPlaylistSort({ field, dir })
    } else {
      handleMainSortChange(field, dir)
    }
  }

  const nowPlayingProps = {
    track: currentTrack,
    playlistLabel: activePlaylistLabel,
    isPlaying,
    isFavorite: isCurrentFavorite,
    position,
    duration,
    volume,
    shuffle,
    repeat,
    playlists,
    onTogglePlay: handleTogglePlay,
    onPrev: handlePrev,
    onNext: () => handleNext(false),
    onSeekChange: setPosition,
    onSeekCommit: handleSeekCommit,
    onVolumeChange: setVolume,
    onToggleFavorite: handleToggleFavorite,
    onToggleShuffle: handleToggleShuffle,
    onCycleRepeat: handleCycleRepeat,
    onOpenQueue: () => {
      setMobilePlayerOpen(false)
      setPage('home')
    },
    onAddToPlaylist: handleAddToPlaylist,
    onCreatePlaylistWithTrack: (tid?: string) => {
      setCreateName('')
      setCreateInitialTrackId(tid)
      setCreateOpen(true)
    },
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration)
          }
        }}
        onEnded={() => handleNext(true)}
      />

      {/* Main Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <DesktopSidebar
          page={page}
          activePlaylistSlug={listCtx.kind === 'playlist' ? listCtx.slug : null}
          playlists={playlists}
          songCount={tracks.length}
          onGoHome={() => setPage('home')}
          onGoSearch={() => setPage('search')}
          onOpenFavorites={openFavoritesPage}
          onOpenPlaylist={(slug) => {
            setListCtx({ kind: 'playlist', slug })
            setPlaylistSort({ field: 'default', dir: 'asc' })
            setPage('playlist')
          }}
          onGoCustomize={() => setPage('customize')}
          onCreatePlaylist={() => {
            setCreateName('')
            setCreateInitialTrackId(undefined)
            setCreateOpen(true)
          }}
          onRescan={handleRescan}
        />

        {/* Primary Content Canvas */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <main className="flex-1 overflow-y-auto">
            {page === 'home' && (
              <HomePage
                tracks={tracks}
                lastPlayed={lastPlayedTracks}
                playlists={playlists}
                currentTrackId={currentTrack?.id ?? null}
                isPlaying={isPlaying}
                progressPct={progressPct}
                sortField={sortPref.field}
                sortDir={sortPref.dir}
                appearance={appearance}
                onSortChange={handleMainSortChange}
                onPlayAll={(subset) => {
                  const list = subset ?? tracks
                  startQueue(
                    list.map((t) => t.id),
                    list[0]?.id,
                    'Songs',
                  )
                }}
                onPlayTrack={(t, subset, label = 'Songs') =>
                  startQueue(
                    subset.map((x) => x.id),
                    t.id,
                    label,
                  )
                }
                onCreatePlaylist={(tid) => {
                  setCreateName('')
                  setCreateInitialTrackId(tid)
                  setCreateOpen(true)
                }}
                onAddToPlaylist={handleAddToPlaylist}
                onOpenSearch={() => setPage('search')}
                onRescan={handleRescan}
              />
            )}

            {page === 'playlist' && (
              <PlaylistPage
                overline={activeListMeta.overline}
                title={activeListMeta.title}
                tracks={activeListMeta.tracks}
                currentTrackId={currentTrack?.id ?? null}
                isPlaying={isPlaying}
                progressPct={progressPct}
                playlists={playlists}
                sortField={currentPlaylistSort.field}
                sortDir={currentPlaylistSort.dir}
                appearance={appearance}
                allowDefaultSort={isCustomPlaylist}
                canDelete={isCustomPlaylist}
                canRemoveTracks={isCustomPlaylist}
                onSortChange={handlePlaylistSortChange}
                onBack={() => setPage('home')}
                onPlayTrack={(t, ordered) =>
                  startQueue(
                    ordered.map((x) => x.id),
                    t.id,
                    activeListMeta.title,
                  )
                }
                onPlayAll={(ordered) =>
                  startQueue(
                    ordered.map((x) => x.id),
                    ordered[0]?.id,
                    activeListMeta.title,
                    false,
                  )
                }
                onShuffleAll={(ordered) =>
                  startQueue(
                    ordered.map((x) => x.id),
                    undefined,
                    activeListMeta.title,
                    true,
                  )
                }
                onAddToPlaylist={handleAddToPlaylist}
                onCreatePlaylistWithTrack={(tid) => {
                  setCreateName('')
                  setCreateInitialTrackId(tid)
                  setCreateOpen(true)
                }}
                onRemoveTrack={
                  activeListMeta.playlistSlug
                    ? (tid) =>
                        handleRemoveFromPlaylist(activeListMeta.playlistSlug!, tid)
                    : undefined
                }
                onDeletePlaylist={
                  activeListMeta.playlistSlug
                    ? () => handleDeletePlaylist(activeListMeta.playlistSlug!)
                    : undefined
                }
              />
            )}

            {page === 'search' && (
              <SearchPage
                query={searchQuery}
                onQueryChange={setSearchQuery}
                results={searchResults ?? tracks}
                folders={folders}
                playlists={playlists}
                currentTrackId={currentTrack?.id ?? null}
                isPlaying={isPlaying}
                progressPct={progressPct}
                appearance={appearance}
                onPlayTrack={(t) => {
                  const pool = searchResults ?? tracks
                  startQueue(
                    pool.map((x) => x.id),
                    t.id,
                    searchQuery ? `Search: ${searchQuery}` : 'Songs',
                  )
                }}
                onOpenFolder={(name) => {
                  setListCtx({ kind: 'folder', name })
                  setPage('playlist')
                }}
                onOpenPlaylist={(slug) => {
                  setListCtx({ kind: 'playlist', slug })
                  setPlaylistSort({ field: 'default', dir: 'asc' })
                  setPage('playlist')
                }}
                onAddToPlaylist={handleAddToPlaylist}
                onCreatePlaylistWithTrack={(tid) => {
                  setCreateName('')
                  setCreateInitialTrackId(tid)
                  setCreateOpen(true)
                }}
              />
            )}

            {page === 'customize' && (
              <CustomizePage
                settings={appearance}
                onChange={updateAppearance}
                onReset={resetAppearance}
              />
            )}
          </main>

          {/* Mobile Bottom Dock (< 1024px) */}
          <MobileDock
            page={page}
            track={currentTrack}
            isPlaying={isPlaying}
            progressPct={progressPct}
            isFavoritesActive={isFavoritesActive}
            onTogglePlay={handleTogglePlay}
            onNext={() => handleNext(false)}
            onExpandPlayer={() => setMobilePlayerOpen(true)}
            onNavigate={(next) => setPage(next)}
            onOpenFavorites={openFavoritesPage}
          />
        </div>
      </div>

      {/* Desktop Minimal Horizontal Bottom Player Bar (>= 1024px) */}
      <DesktopPlayerBar
        track={currentTrack}
        isPlaying={isPlaying}
        isFavorite={isCurrentFavorite}
        position={position}
        duration={duration}
        volume={volume}
        shuffle={shuffle}
        repeat={repeat}
        appearance={appearance}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrev}
        onNext={() => handleNext(false)}
        onSeekChange={setPosition}
        onSeekCommit={handleSeekCommit}
        onVolumeChange={setVolume}
        onToggleFavorite={handleToggleFavorite}
        onToggleShuffle={handleToggleShuffle}
        onCycleRepeat={handleCycleRepeat}
      />

      {/* Mobile Full-Screen Now Playing Sheet (< 1024px) */}
      {mobilePlayerOpen && (
        <div className="fixed inset-0 z-40 h-[100dvh] w-full bg-card lg:hidden">
          <NowPlayingPanel
            {...nowPlayingProps}
            isMobileSheet
            onCloseMobile={() => setMobilePlayerOpen(false)}
          />
        </div>
      )}

      {/* Create Playlist Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Playlist"
        subtitle="Songs stay in zuno/songs/ — only lightweight pointers are saved."
      >
        <form onSubmit={handleCreatePlaylistSubmit} className="space-y-4">
          <Input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Playlist name"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={!createName.trim()}
            >
              Create
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Quiet Toast */}
      {toast && (
        <div className="fixed right-5 bottom-24 z-50 rounded-full border border-border bg-secondary px-4 py-2 text-xs text-foreground shadow-xl lg:bottom-20">
          {toast}
        </div>
      )}
    </div>
  )
}
