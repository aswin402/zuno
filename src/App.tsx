import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DesktopSidebar, type AppPage } from '@/components/DesktopSidebar'
import { DesktopPlayerBar } from '@/components/DesktopPlayerBar'
import { NowPlayingPanel } from '@/components/NowPlayingPanel'
import { MobileDock } from '@/components/MobileDock'
import { MobileNavbar } from '@/components/MobileNavbar'
import { HomePage } from '@/pages/HomePage'
import { LastPlayedPage } from '@/pages/LastPlayedPage'
import { PlaylistsPage } from '@/pages/PlaylistsPage'
import { PlaylistPage } from '@/pages/PlaylistPage'
import { EqualizerPage } from '@/pages/EqualizerPage'
import { CustomizePage } from '@/pages/CustomizePage'
import { SearchOverlay } from '@/components/SearchOverlay'
import { AutoNextBanner } from '@/components/AutoNextBanner'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  applyAppearanceToDom,
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  type AppearanceSettings,
} from '@/lib/appearance'
import { hydrateSavedCustomFonts } from '@/lib/fonts'
import {
  applyEqualizerToAudio,
  EQ_BANDS,
  findActivePreset,
  loadEqSettings,
  resumeEqualizerContext,
  saveEqSettings,
  type EqPreset,
  type EqSettings,
} from '@/lib/equalizer'
import type { SortDir, SortField } from '@/lib/sortTracks'
import {
  zunoApi,
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
  const [eqSettings, setEqSettings] = useState<EqSettings>(loadEqSettings)
  const lastNonEqPageRef = useRef<AppPage>('home')

  const [tracks, setTracks] = useState<Track[]>([])
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Track[] | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [autoNextBanner, setAutoNextBanner] = useState<{
    title: string
    prevIndex: number
    runId: number
  } | null>(null)
  const autoNextTimerRef = useRef<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Track | null>(null)

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

  // Hydrate any user-uploaded custom font files once on startup
  useEffect(() => {
    hydrateSavedCustomFonts()
  }, [])

  const updateAppearance = useCallback((patch: Partial<AppearanceSettings>) => {
    setAppearance((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetAppearance = useCallback(() => {
    setAppearance(DEFAULT_APPEARANCE)
    notify('Restored default style')
  }, [notify])

  const toggleThemeMode = useCallback(() => {
    setAppearance((prev) => ({
      ...prev,
      mode: prev.mode === 'dark' ? 'light' : 'dark',
    }))
  }, [])

  // Persist & live-apply Equalizer DSP settings to the <audio> element
  useEffect(() => {
    saveEqSettings(eqSettings)
    applyEqualizerToAudio(audioRef.current, eqSettings)
    if (eqSettings.enabled) {
      resumeEqualizerContext(audioRef.current)
    }
  }, [eqSettings])

  useEffect(() => {
    if (page !== 'equalizer') {
      lastNonEqPageRef.current = page
    }
  }, [page])

  const updateEqSettings = useCallback((patch: Partial<EqSettings>) => {
    setEqSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleSelectEqPreset = useCallback(
    (preset: EqPreset) => {
      setEqSettings((prev) => ({
        ...prev,
        enabled: true,
        presetId: preset.id,
        bands: [...preset.bands],
        preamp: preset.preamp ?? 0,
      }))
      notify(`EQ: ${preset.name}`)
    },
    [notify],
  )

  const handleSaveCustomEqPreset = useCallback(
    (name: string) => {
      const id = `custom-${Date.now()}`
      const created: EqPreset = {
        id,
        name,
        tagline: 'Custom sound profile',
        category: 'custom',
        bands: [...eqSettings.bands],
        preamp: eqSettings.preamp,
        custom: true,
      }
      setEqSettings((prev) => ({
        ...prev,
        enabled: true,
        presetId: id,
        customPresets: [created, ...prev.customPresets],
      }))
      notify(`Saved preset "${name}"`)
    },
    [eqSettings.bands, eqSettings.preamp, notify],
  )

  const handleDeleteCustomEqPreset = useCallback(
    (id: string) => {
      setEqSettings((prev) => ({
        ...prev,
        presetId: prev.presetId === id ? null : prev.presetId,
        customPresets: prev.customPresets.filter((p) => p.id !== id),
      }))
      notify('Deleted custom preset')
    },
    [notify],
  )

  const handleResetEqFlat = useCallback(() => {
    setEqSettings((prev) => ({
      ...prev,
      presetId: 'flat',
      preamp: 0,
      bands: EQ_BANDS.map(() => 0),
    }))
    notify('Equalizer reset to Flat')
  }, [notify])

  const handleEnsureAudioAttached = useCallback(() => {
    applyEqualizerToAudio(audioRef.current, eqSettings, true)
    resumeEqualizerContext(audioRef.current)
  }, [eqSettings])

  const activeEqPreset = useMemo(() => findActivePreset(eqSettings), [eqSettings])
  const eqLabel = eqSettings.enabled
    ? activeEqPreset
      ? activeEqPreset.name
      : 'Custom'
    : 'Off'

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const refreshLibrary = useCallback(async () => {
    try {
      const [songRes, plRes] = await Promise.all([
        zunoApi.listSongs(),
        zunoApi.listPlaylists(),
      ])
      setTracks(songRes.tracks)
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
        .slice(0, 30),
    [lastPlayedIds, trackById],
  )

  const recordPlayed = useCallback((id: string) => {
    setLastPlayedIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 30)
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
      if (eqSettings.enabled) {
        applyEqualizerToAudio(el, eqSettings, true)
      }
      resumeEqualizerContext(el)
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    },
    [recordPlayed, eqSettings],
  )

  const startQueue = useCallback(
    (
      ids: string[],
      startId?: string,
      label = 'Songs',
      forceShuffle?: boolean,
      _sourceKey = 'songs',
    ) => {
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
          undefined,
          'songs',
        )
      }
      return
    }
    if (el.paused) {
      if (eqSettings.enabled) {
        applyEqualizerToAudio(el, eqSettings, true)
      }
      resumeEqualizerContext(el)
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => {})
    } else {
      el.pause()
      setIsPlaying(false)
    }
  }, [currentTrack, tracks, startQueue, eqSettings])

  const selectOrToggleTrack = useCallback(
    (track: Track, subset: Track[], label: string, sourceKey: string) => {
      if (currentTrack?.id === track.id) {
        handleTogglePlay()
        return
      }
      startQueue(
        subset.map((x) => x.id),
        track.id,
        label,
        undefined,
        sourceKey,
      )
    },
    [currentTrack, handleTogglePlay, startQueue],
  )

  const triggerAutoNextFuse = useCallback((title: string, prevIndex: number) => {
    if (autoNextTimerRef.current !== null) {
      window.clearTimeout(autoNextTimerRef.current)
    }
    setAutoNextBanner({ title, prevIndex, runId: Date.now() })
    autoNextTimerRef.current = window.setTimeout(() => {
      setAutoNextBanner(null)
      autoNextTimerRef.current = null
    }, 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (autoNextTimerRef.current !== null) {
        window.clearTimeout(autoNextTimerRef.current)
      }
    }
  }, [])

  const handleUndoAutoNext = useCallback(() => {
    if (!autoNextBanner) return
    if (autoNextTimerRef.current !== null) {
      window.clearTimeout(autoNextTimerRef.current)
      autoNextTimerRef.current = null
    }
    const prevIdx = autoNextBanner.prevIndex
    setAutoNextBanner(null)
    if (prevIdx >= 0 && prevIdx < queueIds.length) {
      setQueueIndex(prevIdx)
      playTrackById(queueIds[prevIdx])
    }
  }, [autoNextBanner, queueIds, playTrackById])

  const handleRemoveLastPlayed = useCallback(
    (trackId: string) => {
      setLastPlayedIds((prev) => {
        const next = prev.filter((id) => id !== trackId)
        try {
          localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
      notify('Removed from Last Played')
    },
    [notify],
  )

  const handleClearLastPlayed = useCallback(() => {
    setLastPlayedIds([])
    try {
      localStorage.removeItem(LAST_PLAYED_KEY)
    } catch {
      /* ignore */
    }
    notify('Cleared Last Played history')
  }, [notify])

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
        const nextId = queueIds[nextIdx]
        setQueueIndex(nextIdx)
        playTrackById(nextId)
        if (autoAdvance) {
          const nextTrack = trackById.get(nextId)
          if (nextTrack) triggerAutoNextFuse(nextTrack.title, queueIndex)
        }
      } else if (repeat === 'all') {
        const nextId = queueIds[0]
        setQueueIndex(0)
        playTrackById(nextId)
        if (autoAdvance) {
          const nextTrack = trackById.get(nextId)
          if (nextTrack) triggerAutoNextFuse(nextTrack.title, queueIndex)
        }
      } else {
        setIsPlaying(false)
      }
    },
    [queueIds, queueIndex, repeat, playTrackById, trackById, triggerAutoNextFuse],
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
        return
      }
      if (!inInput && e.code === 'Space') {
        e.preventDefault()
        handleTogglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleTogglePlay])

  async function handleConfirmDeleteSong() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await zunoApi.deleteSong(target.id)
      if (currentTrack?.id === target.id && audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        setIsPlaying(false)
        setQueueIndex(null)
      }
      setQueueIds((prev) => prev.filter((id) => id !== target.id))
      setBaseQueueIds((prev) => prev.filter((id) => id !== target.id))
      setLastPlayedIds((prev) => {
        const next = prev.filter((id) => id !== target.id)
        try {
          localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
      await refreshLibrary()
      notify(`Deleted ${target.title}`)
    } catch (err) {
      notify(String(err))
    }
  }

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

  const queueTracks: Track[] = useMemo(
    () =>
      queueIds
        .map((id) => trackById.get(id))
        .filter((t): t is Track => Boolean(t)),
    [queueIds, trackById],
  )

  const handleSelectQueueIndex = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= queueIds.length) return
      setQueueIndex(idx)
      playTrackById(queueIds[idx])
    },
    [queueIds, playTrackById],
  )

  const nowPlayingProps = {
    track: currentTrack,
    queueTracks,
    queueIndex,
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
    onSelectQueueIndex: handleSelectQueueIndex,
    onDeleteTrack: (t: Track) => {
      setMobilePlayerOpen(false)
      setDeleteTarget(t)
    },
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
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
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

      {/* Full-height Left Sidebar (spans 100% top-to-bottom, zero bottom gap) */}
      <DesktopSidebar
        page={page}
        searchOpen={searchOpen}
        activePlaylistSlug={listCtx.kind === 'playlist' ? listCtx.slug : null}
        playlists={playlists}
        songCount={tracks.length}
        recentCount={lastPlayedTracks.length}
        eqEnabled={eqSettings.enabled}
        mode={appearance.mode}
        themeTransition={appearance.themeTransition}
        iconPack={appearance.iconPack}
        onToggleMode={toggleThemeMode}
        onGoHome={() => {
          setSearchOpen(false)
          setPage('home')
        }}
        onGoRecent={() => {
          setSearchOpen(false)
          setPage('recent')
        }}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenFavorites={() => {
          setSearchOpen(false)
          openFavoritesPage()
        }}
        onOpenPlaylist={(slug) => {
          setSearchOpen(false)
          setListCtx({ kind: 'playlist', slug })
          setPlaylistSort({ field: 'default', dir: 'asc' })
          setPage('playlist')
        }}
        onGoEqualizer={() => {
          setSearchOpen(false)
          setPage('equalizer')
        }}
        onGoCustomize={() => {
          setSearchOpen(false)
          setPage('customize')
        }}
        onCreatePlaylist={() => {
          setCreateName('')
          setCreateInitialTrackId(undefined)
          setCreateOpen(true)
        }}
        onRescan={handleRescan}
      />

      {/* Right Content Column: Mobile Top Navbar + Scrollable Pages + Floating Sticky Desktop Player Bar / Mobile Dock */}
      <div className="zuno-canvas relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <MobileNavbar
          page={page}
          activePlaylistSlug={listCtx.kind === 'playlist' ? listCtx.slug : null}
          playlists={playlists}
          eqEnabled={eqSettings.enabled}
          eqLabel={eqLabel}
          mode={appearance.mode}
          themeTransition={appearance.themeTransition}
          iconPack={appearance.iconPack}
          onToggleMode={toggleThemeMode}
          onGoHome={() => {
            setSearchOpen(false)
            setPage('home')
          }}
          onOpenSearch={() => setSearchOpen(true)}
          onGoEqualizer={() => {
            setSearchOpen(false)
            setPage('equalizer')
          }}
          onGoCustomize={() => {
            setSearchOpen(false)
            setPage('customize')
          }}
          onOpenPlaylist={(slug) => {
            setSearchOpen(false)
            setListCtx({ kind: 'playlist', slug })
            setPlaylistSort({ field: 'default', dir: 'asc' })
            setPage('playlist')
          }}
          onCreatePlaylist={() => {
            setCreateName('')
            setCreateInitialTrackId(undefined)
            setCreateOpen(true)
          }}
          onRescan={handleRescan}
        />

        {page === 'customize' ? (
          <main className="min-h-0 flex-1 overflow-hidden">
            <CustomizePage
              settings={appearance}
              onChange={updateAppearance}
              onReset={resetAppearance}
            />
          </main>
        ) : (
        <CompactScrollArea
          className="min-h-0 flex-1"
          viewportClassName={cn(
            appearance.playerBarStyle === 'floating' && 'lg:pb-24',
          )}
        >
        <main>
          {page === 'home' && (
            <HomePage
              tracks={tracks}
              playlists={playlists}
              currentTrackId={currentTrack?.id ?? null}
              isPlaying={isPlaying}
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
                  undefined,
                  'songs',
                )
              }}
              onPlayTrack={(t, subset, label, sourceKey) =>
                selectOrToggleTrack(t, subset, label, sourceKey)
              }
              onDeleteTrack={(t) => setDeleteTarget(t)}
              onCreatePlaylist={(tid) => {
                setCreateName('')
                setCreateInitialTrackId(tid)
                setCreateOpen(true)
              }}
              onAddToPlaylist={handleAddToPlaylist}
            />
          )}

          {page === 'recent' && (
            <LastPlayedPage
              tracks={lastPlayedTracks}
              playlists={playlists}
              currentTrackId={currentTrack?.id ?? null}
              isPlaying={isPlaying}
              appearance={appearance}
              onPlayTrack={(t, subset) =>
                selectOrToggleTrack(t, subset, 'Last Played', 'last-played')
              }
              onPlayAll={(subset) =>
                startQueue(
                  subset.map((t) => t.id),
                  subset[0]?.id,
                  'Last Played',
                  undefined,
                  'last-played',
                )
              }
              onRemoveTrack={handleRemoveLastPlayed}
              onClearAll={handleClearLastPlayed}
              onAddToPlaylist={handleAddToPlaylist}
              onCreatePlaylistWithTrack={(tid) => {
                setCreateName('')
                setCreateInitialTrackId(tid)
                setCreateOpen(true)
              }}
            />
          )}

          {page === 'playlists' && (
            <PlaylistsPage
              playlists={playlists}
              tracksById={trackById}
              appearance={appearance}
              onOpenPlaylist={(slug) => {
                setListCtx({ kind: 'playlist', slug })
                setPlaylistSort({ field: 'default', dir: 'asc' })
                setPage('playlist')
              }}
              onPlayPlaylist={(pl, resolved) =>
                startQueue(
                  resolved.map((t) => t.id),
                  resolved[0]?.id,
                  pl.title,
                  undefined,
                  `playlist:${pl.slug}`,
                )
              }
              onCreatePlaylist={() => {
                setCreateName('')
                setCreateInitialTrackId(undefined)
                setCreateOpen(true)
              }}
            />
          )}

          {page === 'playlist' && (
            <PlaylistPage
              overline={activeListMeta.overline}
              title={activeListMeta.title}
              tracks={activeListMeta.tracks}
              currentTrackId={currentTrack?.id ?? null}
              isPlaying={isPlaying}
              playlists={playlists}
              sortField={currentPlaylistSort.field}
              sortDir={currentPlaylistSort.dir}
              appearance={appearance}
              allowDefaultSort={isCustomPlaylist}
              canDelete={isCustomPlaylist}
              canRemoveTracks={isCustomPlaylist}
              onSortChange={handlePlaylistSortChange}
              onBack={() => setPage('playlists')}
              onPlayTrack={(t, ordered) =>
                selectOrToggleTrack(
                  t,
                  ordered,
                  activeListMeta.title,
                  activeListMeta.playlistSlug
                    ? `playlist:${activeListMeta.playlistSlug}`
                    : 'songs',
                )
              }
              onPlayAll={(ordered) =>
                startQueue(
                  ordered.map((x) => x.id),
                  ordered[0]?.id,
                  activeListMeta.title,
                  false,
                  activeListMeta.playlistSlug
                    ? `playlist:${activeListMeta.playlistSlug}`
                    : 'songs',
                )
              }
              onShuffleAll={(ordered) =>
                startQueue(
                  ordered.map((x) => x.id),
                  undefined,
                  activeListMeta.title,
                  true,
                  activeListMeta.playlistSlug
                    ? `playlist:${activeListMeta.playlistSlug}`
                    : 'songs',
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
              onDeleteTrack={(t) => setDeleteTarget(t)}
              onDeletePlaylist={
                activeListMeta.playlistSlug
                  ? () => handleDeletePlaylist(activeListMeta.playlistSlug!)
                  : undefined
              }
            />
          )}

          {page === 'equalizer' && (
            <EqualizerPage
              settings={eqSettings}
              isPlaying={isPlaying}
              iconPack={appearance.iconPack}
              audioEl={audioRef.current}
              onChange={updateEqSettings}
              onSelectPreset={handleSelectEqPreset}
              onSaveCustomPreset={handleSaveCustomEqPreset}
              onDeleteCustomPreset={handleDeleteCustomEqPreset}
              onResetFlat={handleResetEqFlat}
              onEnsureAudioAttached={handleEnsureAudioAttached}
            />
          )}
        </main>
        </CompactScrollArea>
        )}

        {/* Desktop Floating Sticky Bottom Player Bar (>= 1024px) */}
        <DesktopPlayerBar
          track={currentTrack}
          isPlaying={isPlaying}
          isFavorite={isCurrentFavorite}
          position={position}
          duration={duration}
          volume={volume}
          shuffle={shuffle}
          repeat={repeat}
          eqEnabled={eqSettings.enabled}
          eqLabel={eqLabel}
          eqOpen={page === 'equalizer'}
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
          onToggleEqualizer={() =>
            setPage((p) => (p === 'equalizer' ? lastNonEqPageRef.current : 'equalizer'))
          }
          onExpandPlayer={() => setMobilePlayerOpen(true)}
        />

        {/* Mobile Bottom Dock (< 1024px) */}
        <MobileDock
          page={page}
          searchOpen={searchOpen}
          track={currentTrack}
          isPlaying={isPlaying}
          isFavorite={isCurrentFavorite}
          progressPct={progressPct}
          appearance={appearance}
          onTogglePlay={handleTogglePlay}
          onToggleFavorite={handleToggleFavorite}
          onExpandPlayer={() => setMobilePlayerOpen(true)}
          onNavigate={(next) => {
            setSearchOpen(false)
            setPage(next)
          }}
          onOpenSearch={() => setSearchOpen(true)}
        />
      </div>

      {/* Bencho Search Floating Overlay (Desktop + Mobile) */}
      <SearchOverlay
        open={searchOpen}
        query={searchQuery}
        results={searchResults ?? tracks}
        currentTrackId={currentTrack?.id ?? null}
        isPlaying={isPlaying}
        appearance={appearance}
        onQueryChange={setSearchQuery}
        onSelectTrack={(t, pool) =>
          selectOrToggleTrack(
            t,
            pool,
            searchQuery ? `Search: ${searchQuery}` : 'Songs',
            'songs',
          )
        }
        onClose={() => setSearchOpen(false)}
      />

      {/* Full-Screen Now Playing Player (Mobile + Desktop) */}
      {mobilePlayerOpen && (
        <div className="fixed inset-0 z-40 h-[100dvh] w-full">
          <NowPlayingPanel
            {...nowPlayingProps}
            eqEnabled={eqSettings.enabled}
            eqLabel={eqLabel}
            appearance={appearance}
            isMobileSheet
            onCloseMobile={() => setMobilePlayerOpen(false)}
            onOpenPlaylist={(slug) => {
              setMobilePlayerOpen(false)
              setSearchOpen(false)
              setListCtx({ kind: 'playlist', slug })
              setPlaylistSort({ field: 'default', dir: 'asc' })
              setPage('playlist')
            }}
            onOpenEqualizer={() => {
              setMobilePlayerOpen(false)
              setPage('equalizer')
            }}
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

      {/* Delete Song Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Song"
        subtitle={
          deleteTarget
            ? `Permanently remove "${deleteTarget.title}" from your Zuno folder?`
            : undefined
        }
      >
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleConfirmDeleteSong}
          >
            Delete
          </Button>
        </div>
      </Dialog>

      {/* Auto-Next Fuse Animation Banner (triggers automatically when next song plays) */}
      {autoNextBanner && (
        <AutoNextBanner
          trackTitle={autoNextBanner.title}
          runId={autoNextBanner.runId}
          onUndo={handleUndoAutoNext}
        />
      )}

      {/* Floating Top-Center Hint Toast (never collides inline with dock or rows) */}
      {toast && !autoNextBanner && (
        <div className="pointer-events-none fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-popover/95 px-4 py-2 text-xs font-medium text-popover-foreground shadow-2xl backdrop-blur-md animate-dock-pop whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
