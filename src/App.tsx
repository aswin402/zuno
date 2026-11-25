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
import { FloatingNavigation } from '@/components/FloatingNavigation'
import { GradualBlur } from '@/components/GradualBlur'
import { MusicFoldersModal } from '@/components/MusicFoldersModal'
import { ScrollProgressOverlay } from '@/components/ScrollProgressOverlay'
import { UpdateDialog } from '@/components/UpdateDialog'
import { WindowTitlebar } from '@/components/WindowTitlebar'
import { Dialog } from '@/components/ui/dialog'
import { MotionToast } from '@/components/ui/motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  applyAppearanceToDom,
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  windowRadiusClass,
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
  suspendEqualizerContext,
  type EqPreset,
  type EqSettings,
} from '@/lib/equalizer'
import type { SortDir, SortField } from '@/lib/sortTracks'
import {
  isTauriRuntime,
  zunoApi,
  zunoWindow,
  type MusicSource,
  type PlaybackStatus,
  type Playlist,
  type RepeatMode,
  type Track,
  type UpdateInfo,
} from '@/lib/zunoApi'

type ListContext =
  | { kind: 'all' }
  | { kind: 'folder'; name: string }
  | { kind: 'playlist'; slug: string }

const LAST_PLAYED_KEY = 'zuno:last_played'
const SORT_PREF_KEY = 'zuno:sort_pref'
const AUTO_CHECK_UPDATES_KEY = 'zuno:auto_check_updates'
const SKIPPED_UPDATE_KEY = 'zuno:skipped_update_version'

function loadAutoCheckUpdates(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_CHECK_UPDATES_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

function loadSkippedUpdateVersion(): string | null {
  try {
    return localStorage.getItem(SKIPPED_UPDATE_KEY)
  } catch {
    return null
  }
}

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
  const nativeAudio = isTauriRuntime()
  const [page, setPage] = useState<AppPage>('home')
  const [mobilePlayerOpen, setMobilePlayerOpen] = useState(false)
  const [windowMaximized, setWindowMaximized] = useState(false)
  const [listCtx, setListCtx] = useState<ListContext>({ kind: 'all' })
  const mainScrollRef = useRef<HTMLDivElement | null>(null)
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance)
  const [eqSettings, setEqSettings] = useState<EqSettings>(loadEqSettings)
  const lastNonEqPageRef = useRef<AppPage>('home')
  const lastNonCustomizePageRef = useRef<AppPage>('home')

  const [tracks, setTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [sources, setSources] = useState<MusicSource[]>([])
  const [suggestedDirs, setSuggestedDirs] = useState<string[]>([])
  const [appVersion, setAppVersion] = useState<string>('0.0.17')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null)
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean>(loadAutoCheckUpdates)
  const [skippedVersion, setSkippedVersion] = useState<string | null>(loadSkippedUpdateVersion)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [foldersBusy, setFoldersBusy] = useState(false)
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
  const lastReportedPosRef = useRef<number>(-1)
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

  // Enable transparent root edges in frameless Tauri desktop mode so outer window corners curve cleanly
  useEffect(() => {
    document.documentElement.classList.toggle('zuno-tauri-window', nativeAudio)
  }, [nativeAudio])

  // Apply appearance CSS custom properties live whenever settings change
  useEffect(() => {
    applyAppearanceToDom(appearance)
    saveAppearance(appearance)
  }, [appearance])

  // Hydrate any user-uploaded custom font files once on startup
  useEffect(() => {
    hydrateSavedCustomFonts()
  }, [])

  // Pause all CSS animations automatically when window/tab is hidden to save GPU/CPU
  useEffect(() => {
    const onVis = () => {
      document.documentElement.classList.toggle('zuno-hidden', document.hidden)
    }
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
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

  // Persist & live-apply Equalizer DSP settings (pure Rust biquad DSP in Tauri, Web Audio in browser)
  useEffect(() => {
    saveEqSettings(eqSettings)
    if (nativeAudio) {
      zunoApi
        .setEq({
          enabled: eqSettings.enabled,
          preamp: eqSettings.preamp,
          limiter: eqSettings.limiter,
          bands: eqSettings.bands,
        })
        .catch(() => {})
      return
    }
    applyEqualizerToAudio(audioRef.current, eqSettings)
    if (eqSettings.enabled) {
      resumeEqualizerContext(audioRef.current)
    }
  }, [eqSettings, nativeAudio])

  useEffect(() => {
    if (page !== 'equalizer') {
      lastNonEqPageRef.current = page
    }
    if (page !== 'customize') {
      lastNonCustomizePageRef.current = page
    }
  }, [page])

  // Sync audio crossfade / fade-in duration into the pure-Rust Rodio engine
  useEffect(() => {
    if (!nativeAudio) return
    zunoApi.setTransition(appearance.crossfadeSecs ?? 0).catch(() => {})
  }, [nativeAudio, appearance.crossfadeSecs])

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
      const [songRes, plRes, srcRes, infoRes] = await Promise.all([
        zunoApi.listSongs(),
        zunoApi.listPlaylists(),
        zunoApi.listSources().catch(() => [] as MusicSource[]),
        zunoApi.getInfo().catch(() => null),
      ])
      setTracks(songRes.tracks)
      setPlaylists(plRes)
      if (srcRes.length > 0) setSources(srcRes)
      if (infoRes?.suggested_dirs) setSuggestedDirs(infoRes.suggested_dirs)
      if (infoRes?.version) setAppVersion(infoRes.version)
    } catch {
      /* backend offline */
    }
  }, [])

  const collectUiSettingsSnapshot = useCallback((): string => {
    const dump: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      version: appVersion,
    }
    try {
      for (const key of [
        'zuno:appearance',
        'zuno:eq',
        LAST_PLAYED_KEY,
        SORT_PREF_KEY,
        AUTO_CHECK_UPDATES_KEY,
      ]) {
        const raw = localStorage.getItem(key)
        if (raw !== null) {
          try {
            dump[key] = JSON.parse(raw)
          } catch {
            dump[key] = raw
          }
        }
      }
    } catch {
      /* ignore */
    }
    return JSON.stringify(dump, null, 2)
  }, [appVersion])

  const handleCheckForUpdates = useCallback(
    async (silent: boolean) => {
      if (!nativeAudio) return
      setUpdateChecking(true)
      if (!silent) setUpdateCheckError(null)
      try {
        const info = await zunoApi.checkUpdate()
        if (info) {
          setUpdateInfo(info)
          setUpdateCheckError(null)
          if (info.update_available) {
            if (!silent || info.latest_version !== skippedVersion) {
              notify(`Zuno v${info.latest_version} is available`)
              setUpdateDialogOpen(true)
            }
          } else if (!silent) {
            notify(`Zuno v${info.current_version} is up to date`)
          }
        }
      } catch (err) {
        if (!silent) {
          setUpdateCheckError(String(err).replace(/^Error:\s*/i, ''))
        }
      } finally {
        setUpdateChecking(false)
      }
    },
    [nativeAudio, skippedVersion, notify],
  )

  const handleToggleAutoCheckUpdates = useCallback((next: boolean) => {
    setAutoCheckUpdates(next)
    try {
      localStorage.setItem(AUTO_CHECK_UPDATES_KEY, String(next))
    } catch {
      /* ignore */
    }
  }, [])

  const handleSkipUpdateVersion = useCallback(
    (ver: string) => {
      setSkippedVersion(ver)
      try {
        localStorage.setItem(SKIPPED_UPDATE_KEY, ver)
      } catch {
        /* ignore */
      }
      notify(`Skipped v${ver}`)
    },
    [notify],
  )

  // Silent background release check 2.5s after native app startup (never blocks or errors offline)
  useEffect(() => {
    if (!nativeAudio || !autoCheckUpdates) return
    const timer = window.setTimeout(() => {
      handleCheckForUpdates(true)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [nativeAudio, autoCheckUpdates, handleCheckForUpdates])

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
    if (nativeAudio) {
      zunoApi.setVolume(volume).catch(() => {})
    } else if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume, nativeAudio])

  const lastNativeTrackIdRef = useRef<string | null>(null)
  const queueIdsRef = useRef<string[]>([])
  queueIdsRef.current = queueIds

  const applyNativeStatus = useCallback((st: PlaybackStatus) => {
    setIsPlaying(st.state === 'playing')
    setPosition(st.position_secs)
    if (st.duration_secs > 0) setDuration(st.duration_secs)
    setShuffle(st.shuffle)
    setRepeat(st.repeat)
    if (st.queue_index !== null) setQueueIndex(st.queue_index)
    if (st.active_playlist) setActivePlaylistLabel(st.active_playlist)
    const tid = st.current_track?.id ?? null
    // If playback changed externally (MPRIS media keys, GNOME banner, tray, CLI), sync queue!
    if (
      tid &&
      (st.queue_len !== queueIdsRef.current.length ||
        (st.queue_index !== null && queueIdsRef.current[st.queue_index] !== tid))
    ) {
      zunoApi
        .queueGet()
        .then((q) => {
          const ids = q.tracks.map((t) => t.id)
          if (ids.length > 0) {
            setQueueIds(ids)
            setBaseQueueIds(ids)
          }
        })
        .catch(() => {})
    }
    if (tid && tid !== lastNativeTrackIdRef.current) {
      lastNativeTrackIdRef.current = tid
      setLastPlayedIds((prev) => {
        const next = [tid, ...prev.filter((x) => x !== tid)].slice(0, 30)
        try {
          localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    }
  }, [])

  // In native Tauri mode, restore live Rust playback & queue on window open/recreate
  useEffect(() => {
    if (!nativeAudio) return
    let cancelled = false
    Promise.all([zunoApi.getStatus(), zunoApi.queueGet()])
      .then(([st, q]) => {
        if (cancelled) return
        setVolume(st.volume)
        if (q.tracks.length > 0) {
          const ids = q.tracks.map((t) => t.id)
          setQueueIds(ids)
          setBaseQueueIds(ids)
        }
        applyNativeStatus(st)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [nativeAudio, applyNativeStatus])

  // Lightweight in-process status sync while visible in Tauri mode (pauses completely when hidden)
  useEffect(() => {
    if (!nativeAudio) return
    let timer = 0
    const poll = () => {
      if (document.hidden) {
        timer = window.setTimeout(poll, 1200)
        return
      }
      zunoApi
        .getStatus()
        .then((st) => {
          applyNativeStatus(st)
          timer = window.setTimeout(poll, st.state === 'playing' ? 350 : 1500)
        })
        .catch(() => {
          timer = window.setTimeout(poll, 2000)
        })
    }
    timer = window.setTimeout(poll, isPlaying ? 350 : 1500)
    return () => window.clearTimeout(timer)
  }, [nativeAudio, isPlaying, applyNativeStatus])

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

  const favoritesPlaylist = useMemo(
    () =>
      playlists.find((p) => p.slug === 'favorites' || p.slug === 'fav') ?? null,
    [playlists],
  )

  const isCurrentFavorite = useMemo(() => {
    if (!currentTrack || !favoritesPlaylist) return false
    return favoritesPlaylist.track_ids.includes(currentTrack.id)
  }, [currentTrack, favoritesPlaylist])

  const browserFadeRafRef = useRef<number>(0)

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

      const fadeSecs = appearance.crossfadeSecs ?? 0
      if (browserFadeRafRef.current) {
        cancelAnimationFrame(browserFadeRafRef.current)
        browserFadeRafRef.current = 0
      }
      if (fadeSecs > 0.05) {
        const targetVol = volume
        const fadeMs = Math.min(fadeSecs, 4) * 1000
        el.volume = 0
        const started = performance.now()
        const ramp = (now: number) => {
          const t = Math.min(1, (now - started) / fadeMs)
          el.volume = targetVol * Math.sin(t * (Math.PI / 2))
          if (t < 1 && !el.paused) {
            browserFadeRafRef.current = requestAnimationFrame(ramp)
          } else {
            el.volume = targetVol
            browserFadeRafRef.current = 0
          }
        }
        browserFadeRafRef.current = requestAnimationFrame(ramp)
      } else {
        el.volume = volume
      }

      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    },
    [recordPlayed, eqSettings, appearance.crossfadeSecs, volume],
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
      if (nativeAudio) {
        setBaseQueueIds(ids)
        setActivePlaylistLabel(label)
        setPosition(0)
        zunoApi
          .setQueue({
            track_ids: ids,
            start_id: startId ?? (useShuffle ? null : ids[0]),
            label,
            shuffle: forceShuffle ?? null,
          })
          .then(async (st) => {
            const q = await zunoApi.queueGet().catch(() => null)
            if (q) setQueueIds(q.tracks.map((t) => t.id))
            applyNativeStatus(st)
          })
          .catch(() => {})
        return
      }
      const ordered = useShuffle ? shuffleIds(ids, startId) : ids
      const idx = startId ? Math.max(0, ordered.indexOf(startId)) : 0
      setBaseQueueIds(ids)
      setQueueIds(ordered)
      setQueueIndex(idx)
      setActivePlaylistLabel(label)
      setPosition(0)
      playTrackById(ordered[idx])
    },
    [shuffle, playTrackById, nativeAudio, applyNativeStatus],
  )

  const handleTogglePlay = useCallback(() => {
    if (nativeAudio) {
      if (!currentTrack && queueIds.length === 0) {
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
      zunoApi
        .togglePause()
        .then(applyNativeStatus)
        .catch(() => {})
      return
    }
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
      suspendEqualizerContext(el)
      setIsPlaying(false)
    }
  }, [
    nativeAudio,
    currentTrack,
    queueIds.length,
    tracks,
    startQueue,
    eqSettings,
    applyNativeStatus,
  ])

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
      if (nativeAudio) {
        zunoApi.next().then(applyNativeStatus).catch(() => {})
        return
      }
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
    [
      nativeAudio,
      applyNativeStatus,
      queueIds,
      queueIndex,
      repeat,
      playTrackById,
      trackById,
      triggerAutoNextFuse,
    ],
  )

  const handlePrev = useCallback(() => {
    if (nativeAudio) {
      zunoApi.previous().then(applyNativeStatus).catch(() => {})
      return
    }
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
  }, [nativeAudio, applyNativeStatus, queueIds, queueIndex, repeat, playTrackById])

  const handleSeekCommit = useCallback(
    (secs: number) => {
      if (nativeAudio) {
        zunoApi.seek(secs).then(applyNativeStatus).catch(() => {})
        return
      }
      if (audioRef.current) audioRef.current.currentTime = secs
    },
    [nativeAudio, applyNativeStatus],
  )

  const handleToggleShuffle = useCallback(() => {
    const next = !shuffle
    setShuffle(next)
    if (nativeAudio) {
      zunoApi
        .setMode({ shuffle: next })
        .then(async (st) => {
          const q = await zunoApi.queueGet().catch(() => null)
          if (q) setQueueIds(q.tracks.map((t) => t.id))
          applyNativeStatus(st)
        })
        .catch(() => {})
      return
    }
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
  }, [nativeAudio, applyNativeStatus, shuffle, baseQueueIds, queueIds, queueIndex])

  const handleCycleRepeat = useCallback(() => {
    const next: RepeatMode =
      repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off'
    setRepeat(next)
    if (nativeAudio) {
      zunoApi.setMode({ repeat: next }).then(applyNativeStatus).catch(() => {})
    }
  }, [nativeAudio, applyNativeStatus, repeat])

  // Browser Media Session API (for web/mobile mode — native Tauri uses Rust MPRIS2 directly)
  useEffect(() => {
    if (nativeAudio || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return
    }
    const ms = navigator.mediaSession
    if (currentTrack) {
      const artist =
        currentTrack.artist === 'Unknown Artist' && currentTrack.folder
          ? currentTrack.folder
          : currentTrack.artist
      const artwork = currentTrack.has_cover
        ? [{ src: zunoApi.coverUrl(currentTrack.id) }]
        : [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
      ms.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist,
        album: currentTrack.album || currentTrack.folder || 'Zuno',
        artwork,
      })
    } else {
      ms.metadata = null
    }
    ms.playbackState = currentTrack ? (isPlaying ? 'playing' : 'paused') : 'none'
  }, [nativeAudio, currentTrack, isPlaying])

  useEffect(() => {
    if (nativeAudio || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return
    }
    const ms = navigator.mediaSession
    const safeSet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        /* unsupported action */
      }
    }
    safeSet('play', () => {
      if (!isPlaying) handleTogglePlay()
    })
    safeSet('pause', () => {
      if (isPlaying) handleTogglePlay()
    })
    safeSet('previoustrack', () => handlePrev())
    safeSet('nexttrack', () => handleNext(false))
    safeSet('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        setPosition(details.seekTime)
        handleSeekCommit(details.seekTime)
      }
    })
    return () => {
      safeSet('play', null)
      safeSet('pause', null)
      safeSet('previoustrack', null)
      safeSet('nexttrack', null)
      safeSet('seekto', null)
    }
  }, [nativeAudio, isPlaying, handleTogglePlay, handlePrev, handleNext, handleSeekCommit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const inInput =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable)
      const hasModifier = e.ctrlKey || e.altKey || e.metaKey

      // Hardware / OS Media Keys forwarded to focused window
      if (e.key === 'MediaPlayPause' || e.code === 'MediaPlayPause') {
        e.preventDefault()
        handleTogglePlay()
        return
      }
      if (e.key === 'MediaTrackNext' || e.code === 'MediaTrackNext') {
        e.preventDefault()
        handleNext(false)
        return
      }
      if (e.key === 'MediaTrackPrevious' || e.code === 'MediaTrackPrevious') {
        e.preventDefault()
        handlePrev()
        return
      }
      if (e.key === 'MediaStop' || e.code === 'MediaStop') {
        e.preventDefault()
        if (nativeAudio) {
          zunoApi.stop().then(applyNativeStatus).catch(() => {})
        } else if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          setIsPlaying(false)
          setPosition(0)
        }
        return
      }

      // App shortcuts with Ctrl / Meta
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const lower = e.key.toLowerCase()
        if (lower === 'k') {
          e.preventDefault()
          setSearchOpen((v) => !v)
          return
        }
        if (lower === 'q' && nativeAudio) {
          e.preventDefault()
          zunoWindow.quit()
          return
        }
        // Never intercept other system Ctrl/Super combos (Ctrl+C, Super+Space, Ctrl+Alt+T, etc.)
        return
      }

      // Never intercept Alt / Super system window manager shortcuts (Alt+Space, Alt+Tab, Alt+F4, etc.)
      if (hasModifier) return

      if (e.key === 'F11' && nativeAudio) {
        e.preventDefault()
        zunoWindow.toggleFullscreen()
        return
      }

      if (inInput) return

      // Plain Space (without Alt/Ctrl/Meta/Shift) toggles play/pause
      if (e.code === 'Space' && !e.shiftKey) {
        e.preventDefault()
        handleTogglePlay()
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.shiftKey) {
          handleNext(false)
        } else {
          const maxDur = duration > 0 ? duration : (currentTrack?.duration_secs ?? 0)
          const targetPos = Math.min(maxDur > 0 ? maxDur : position + 5, position + 5)
          setPosition(targetPos)
          handleSeekCommit(targetPos)
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (e.shiftKey) {
          handlePrev()
        } else {
          const targetPos = Math.max(0, position - 5)
          setPosition(targetPos)
          handleSeekCommit(targetPos)
        }
        return
      }

      if (!e.shiftKey) {
        const lower = e.key.toLowerCase()
        if (lower === 'm') {
          e.preventDefault()
          setVolume((v) => (v > 0.001 ? 0 : 0.8))
        } else if (lower === 's') {
          e.preventDefault()
          handleToggleShuffle()
        } else if (lower === 'r') {
          e.preventDefault()
          handleCycleRepeat()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    nativeAudio,
    applyNativeStatus,
    currentTrack,
    duration,
    position,
    handleTogglePlay,
    handleNext,
    handlePrev,
    handleSeekCommit,
    handleToggleShuffle,
    handleCycleRepeat,
  ])

  async function handleConfirmDeleteSong() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await zunoApi.deleteSong(target.id)
      if (currentTrack?.id === target.id) {
        if (nativeAudio) {
          await zunoApi.stop().catch(() => {})
        } else if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.removeAttribute('src')
        }
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

  async function handleAddMusicFolder(path: string) {
    setFoldersBusy(true)
    try {
      const updated = await zunoApi.addSource(path)
      setSources(updated)
      await refreshLibrary()
      notify('Linked music folder')
    } finally {
      setFoldersBusy(false)
    }
  }

  async function handlePickNativeFolder() {
    const picked = await zunoApi.pickMusicFolder()
    if (!picked) return
    await handleAddMusicFolder(picked)
  }

  async function handleRemoveMusicFolder(path: string) {
    setFoldersBusy(true)
    try {
      const updated = await zunoApi.removeSource(path)
      setSources(updated)
      await refreshLibrary()
      notify('Unlinked folder (files untouched)')
    } catch (err) {
      notify(String(err))
    } finally {
      setFoldersBusy(false)
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

  const handleAddToPlaylist = useCallback(
    async (slug: string, trackId: string) => {
      try {
        await zunoApi.addToPlaylist(slug, [trackId])
        await refreshLibrary()
        notify('Added to playlist')
      } catch (err) {
        notify(String(err))
      }
    },
    [refreshLibrary, notify],
  )

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

  const handleMainSortChange = useCallback((field: SortField, dir: SortDir) => {
    const next = { field, dir }
    setSortPref(next)
    try {
      localStorage.setItem(SORT_PREF_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const handlePlayAllHome = useCallback(
    (subset?: Track[]) => {
      const list = subset ?? tracks
      startQueue(
        list.map((t) => t.id),
        shuffle ? undefined : list[0]?.id,
        'Songs',
        undefined,
        'songs',
      )
    },
    [tracks, shuffle, startQueue],
  )

  const handleOpenCreatePlaylist = useCallback((tid?: string) => {
    setCreateName('')
    setCreateInitialTrackId(tid)
    setCreateOpen(true)
  }, [])

  const handleRequestDeleteTrack = useCallback((t: Track) => {
    setDeleteTarget(t)
  }, [])

  const handleOpenFolders = useCallback(() => {
    setFoldersOpen(true)
  }, [])

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
      if (nativeAudio) {
        zunoApi.jumpQueue(idx).then(applyNativeStatus).catch(() => {})
        return
      }
      setQueueIndex(idx)
      playTrackById(queueIds[idx])
    },
    [nativeAudio, applyNativeStatus, queueIds, playTrackById],
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

  const roundedFrame = nativeAudio && !windowMaximized

  return (
    <div
      className={cn(
        'flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground transition-[border-radius] duration-150',
        roundedFrame && cn(windowRadiusClass(appearance.windowRadius), 'border border-border/85'),
      )}
    >
      {/* Custom Themed Native Desktop Window Titlebar (Tauri frameless chrome) */}
      <WindowTitlebar
        styleVariant={appearance.titlebarStyle}
        align={appearance.titlebarAlign}
        showTrack={appearance.titlebarShowTrack}
        compact={appearance.titlebarCompact}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onMaximizedChange={setWindowMaximized}
      />

      <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
      {!nativeAudio && (
        <audio
          ref={audioRef}
          preload="auto"
          onTimeUpdate={(e) => {
            const el = e.currentTarget
            const t = el.currentTime
            const fadeSecs = appearance.crossfadeSecs ?? 0
            if (
              fadeSecs > 0.05 &&
              Number.isFinite(el.duration) &&
              el.duration > fadeSecs + 1.5 &&
              !browserFadeRafRef.current
            ) {
              const remaining = el.duration - t
              if (remaining <= fadeSecs && remaining > 0) {
                const ratio = Math.max(0, Math.min(1, remaining / fadeSecs))
                el.volume = volume * Math.sin(ratio * (Math.PI / 2))
              }
            }
            if (Math.abs(t - lastReportedPosRef.current) >= 0.25 || t < 0.05) {
              lastReportedPosRef.current = t
              setPosition(t)
            }
          }}
          onPlay={(e) => resumeEqualizerContext(e.currentTarget)}
          onPause={(e) => suspendEqualizerContext(e.currentTarget)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration)
            }
          }}
          onEnded={() => handleNext(true)}
        />
      )}

      {/* Full-height Left Sidebar (shown when Desktop Navigation Theme is 'sidebar') */}
      {appearance.navStyle === 'sidebar' && (
        <DesktopSidebar
          page={page}
          searchOpen={searchOpen}
          activePlaylistSlug={listCtx.kind === 'playlist' ? listCtx.slug : null}
          playlists={playlists}
          songCount={tracks.length}
          recentCount={lastPlayedTracks.length}
          sourceCount={Math.max(1, sources.length)}
          eqEnabled={eqSettings.enabled}
          mode={appearance.mode}
          themeTransition={appearance.themeTransition}
          themeTransitionStart={appearance.themeTransitionStart}
          themeToggleStyle={appearance.themeToggleStyle}
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
          onOpenFolders={() => setFoldersOpen(true)}
          onCreatePlaylist={() => {
            setCreateName('')
            setCreateInitialTrackId(undefined)
            setCreateOpen(true)
          }}
          onRescan={handleRescan}
          appVersion={appVersion}
          updateAvailableVersion={
            updateInfo?.update_available ? updateInfo.latest_version : null
          }
          onOpenUpdates={() => {
            setUpdateDialogOpen(true)
            if (nativeAudio && !updateInfo) {
              handleCheckForUpdates(false)
            }
          }}
        />
      )}

      {/* Right Content Column: Mobile Top Navbar + Floating Desktop Nav + Scrollable Pages + Player Bar / Mobile Dock */}
      <div className="zuno-canvas relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Alternative Desktop Floating Navigation Themes (SmoothUI Floating Navbar / Great UI Floating Dock & Menu) */}
        <FloatingNavigation
          navStyle={appearance.navStyle}
          page={page}
          searchOpen={searchOpen}
          activePlaylistSlug={listCtx.kind === 'playlist' ? listCtx.slug : null}
          playlists={playlists}
          songCount={tracks.length}
          recentCount={lastPlayedTracks.length}
          sourceCount={Math.max(1, sources.length)}
          eqEnabled={eqSettings.enabled}
          mode={appearance.mode}
          themeTransition={appearance.themeTransition}
          themeTransitionStart={appearance.themeTransitionStart}
          themeToggleStyle={appearance.themeToggleStyle}
          iconPack={appearance.iconPack}
          scrollElementRef={mainScrollRef}
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
          onOpenPlaylistsHub={() => {
            setSearchOpen(false)
            setPage('playlists')
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
          onOpenFolders={handleOpenFolders}
          onCreatePlaylist={() => {
            setCreateName('')
            setCreateInitialTrackId(undefined)
            setCreateOpen(true)
          }}
          onRescan={handleRescan}
          appVersion={appVersion}
          updateAvailableVersion={
            updateInfo?.update_available ? updateInfo.latest_version : null
          }
          onOpenUpdates={() => {
            setUpdateDialogOpen(true)
            if (nativeAudio && !updateInfo) {
              handleCheckForUpdates(false)
            }
          }}
        />

        <MobileNavbar
          page={page}
          activePlaylistSlug={listCtx.kind === 'playlist' ? listCtx.slug : null}
          playlists={playlists}
          sourceCount={Math.max(1, sources.length)}
          eqEnabled={eqSettings.enabled}
          eqLabel={eqLabel}
          mode={appearance.mode}
          themeTransition={appearance.themeTransition}
          themeTransitionStart={appearance.themeTransitionStart}
          themeToggleStyle={appearance.themeToggleStyle}
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
          onOpenFolders={() => setFoldersOpen(true)}
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
          appVersion={appVersion}
          updateAvailableVersion={
            updateInfo?.update_available ? updateInfo.latest_version : null
          }
          onOpenUpdates={() => {
            setUpdateDialogOpen(true)
            if (nativeAudio && !updateInfo) {
              handleCheckForUpdates(false)
            }
          }}
        />

        <CompactScrollArea
          className="min-h-0 flex-1"
          viewportRefOut={mainScrollRef}
          overlay={
            <ScrollProgressOverlay styleVariant={appearance.scrollProgressStyle} />
          }
          viewportClassName={cn(
            currentTrack ? 'pb-36' : 'pb-20',
            appearance.playerBarStyle === 'floating' ? 'lg:pb-24' : 'lg:pb-0',
            appearance.navStyle !== 'sidebar' && 'lg:pt-14',
          )}
        >
        <main
          key={
            page === 'playlist'
              ? `playlist:${listCtx.kind === 'playlist' ? listCtx.slug : ''}`
              : page
          }
          className="t-page-enter"
        >
          {page === 'home' && (
            <HomePage
              tracks={tracks}
              playlists={playlists}
              sourceCount={Math.max(1, sources.length)}
              currentTrackId={currentTrack?.id ?? null}
              isPlaying={isPlaying}
              sortField={sortPref.field}
              sortDir={sortPref.dir}
              appearance={appearance}
              onSortChange={handleMainSortChange}
              onPlayAll={handlePlayAllHome}
              onOpenFolders={handleOpenFolders}
              onPlayTrack={selectOrToggleTrack}
              onDeleteTrack={handleRequestDeleteTrack}
              onCreatePlaylist={handleOpenCreatePlaylist}
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

        {/* Bottom-Only Progressive GradualBlur (@react-bits/GradualBlur-TS-TW) behind floating docks */}
        {appearance.dockGradualBlur && (
          <>
            <GradualBlur
              position="bottom"
              height={currentTrack ? '9.5rem' : '5.75rem'}
              strength={1.6}
              divCount={5}
              curve="bezier"
              exponential
              zIndex={10}
              className="lg:hidden"
            />
            {appearance.playerBarStyle === 'floating' && (
              <GradualBlur
                position="bottom"
                height="6.5rem"
                strength={1.5}
                divCount={5}
                curve="bezier"
                exponential
                zIndex={10}
                className="hidden lg:block"
              />
            )}
          </>
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

      {/* Full-Screen Appearance & Audio Customize Studio (Desktop + Mobile, below custom titlebar) */}
      {page === 'customize' && (
        <div className="absolute inset-0 z-30 h-full w-full bg-background animate-sheet-up">
          <CustomizePage
            settings={appearance}
            onChange={updateAppearance}
            onReset={resetAppearance}
            onBack={() => setPage(lastNonCustomizePageRef.current)}
          />
        </div>
      )}

      {/* Full-Screen Now Playing Player (Mobile + Desktop, below custom titlebar) */}
      {mobilePlayerOpen && (
        <div className="absolute inset-0 z-40 h-full w-full">
          <NowPlayingPanel
            {...nowPlayingProps}
            eqEnabled={eqSettings.enabled}
            eqLabel={eqLabel}
            appearance={appearance}
            audioEl={audioRef.current}
            isMobileSheet
            onCloseMobile={() => setMobilePlayerOpen(false)}
            onEnsureAudioAttached={handleEnsureAudioAttached}
            onCycleVisualizer={() => {
              const order = [
                'orb',
                'wave-bars',
                'fluid-wave',
                'radial-ring',
                'aurora-pulse',
                'none',
              ] as const
              const idx = order.indexOf(appearance.visualizerStyle)
              updateAppearance({
                visualizerStyle: order[(idx + 1) % order.length],
              })
            }}
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

      {/* Music Folders Manager (Zero-copy Multi-Directory Import) */}
      <MusicFoldersModal
        open={foldersOpen}
        sources={sources}
        suggestedDirs={suggestedDirs}
        busy={foldersBusy}
        onClose={() => setFoldersOpen(false)}
        onPickNativeFolder={handlePickNativeFolder}
        onAddFolder={handleAddMusicFolder}
        onRemoveFolder={handleRemoveMusicFolder}
        onRescan={handleRescan}
      />

      {/* Delete Song Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Song"
        subtitle={
          deleteTarget
            ? deleteTarget.source_dir
              ? `Permanently delete "${deleteTarget.title}" from ${deleteTarget.source_dir}? (To keep files, unlink the folder in Music Folders instead.)`
              : `Permanently remove "${deleteTarget.title}" from your Zuno folder?`
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

      {/* Release Update & Zero-Copy Data Backup Dialog */}
      <UpdateDialog
        open={updateDialogOpen}
        appVersion={appVersion}
        updateInfo={updateInfo}
        checking={updateChecking}
        checkError={updateCheckError}
        autoCheck={autoCheckUpdates}
        onToggleAutoCheck={handleToggleAutoCheckUpdates}
        onCheckNow={() => handleCheckForUpdates(false)}
        onSkipVersion={handleSkipUpdateVersion}
        onCollectUiSettings={collectUiSettingsSnapshot}
        onBackupDone={(report) =>
          notify(`Backed up ${report.files_count} files safely`)
        }
        onClose={() => setUpdateDialogOpen(false)}
      />

      {/* Auto-Next Fuse Animation Banner (triggers automatically when next song plays) */}
      {autoNextBanner && (
        <AutoNextBanner
          trackTitle={autoNextBanner.title}
          runId={autoNextBanner.runId}
          onUndo={handleUndoAutoNext}
        />
      )}

      {/* Floating Top-Center Hint Toast (transitions.dev 22 · asymmetric 350ms open / 250ms close) */}
      <MotionToast message={!autoNextBanner ? toast : null} edge="top" />
      </div>
    </div>
  )
}
