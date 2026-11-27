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
import { RadioPage } from '@/pages/RadioPage'
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
  DEFAULT_VOLUME,
  displayArtist,
  formatError,
  freqToDeciMhz,
  isFavoritesPlaylist,
  LAST_PLAYED_MAX,
  MUTE_EPSILON,
} from '@/lib/format'
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearanceToDom,
  clampUiZoom,
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  UI_ZOOM_STEP,
  windowRadiusClass,
  type AppearanceSettings,
} from '@/lib/appearance'
import { CUSTOM_FONT_STORAGE_KEY, hydrateSavedCustomFonts } from '@/lib/fonts'
import {
  applyEqualizerToAudio,
  DEFAULT_EQ_SETTINGS,
  EQ_BANDS,
  EQ_STORAGE_KEY,
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
  CURATED_ONLINE_STATIONS,
  FM_BANDS,
  type FmBandId,
  type OnlineStation,
} from '@/lib/radioStations'
import {
  clampFreqToBand,
  DEFAULT_RADIO_STORE,
  formatMhz,
  loadRadioStore,
  mergeOnlineStations,
  saveRadioStore,
  type ActiveRadioPlayback,
  type DiscoveredStation,
  type FmHardwareStatus,
  type OfflineSignalStation,
  type RadioStoreData,
} from '@/lib/radioStore'
import {
  getAndroidBridge,
  isDesktopTauriRuntime,
  isTauriRuntime,
  zunoApi,
  zunoWindow,
  type MusicSource,
  type NativeRadioInfo,
  type PersistedAppSettings,
  type PlaybackStatus,
  type Playlist,
  type RepeatMode,
  type Track,
  type UiCommand,
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

function nativeRadioToActive(info: NativeRadioInfo): ActiveRadioPlayback {
  return {
    kind: info.kind,
    id: info.id,
    name: info.name,
    subtitle: info.subtitle,
    url: info.url ?? undefined,
    freqMhz: info.freq_mhz ?? undefined,
    isPlaying: info.state === 'playing',
    isBuffering: info.state === 'connecting',
    error: info.error ?? null,
  }
}

function sameActiveRadio(
  a: ActiveRadioPlayback | null,
  b: ActiveRadioPlayback | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.kind === b.kind &&
    a.id === b.id &&
    a.name === b.name &&
    a.subtitle === b.subtitle &&
    a.url === b.url &&
    a.freqMhz === b.freqMhz &&
    a.isPlaying === b.isPlaying &&
    a.isBuffering === b.isBuffering &&
    a.error === b.error
  )
}

export default function App() {
  const nativeAudio = isTauriRuntime()
  const desktopNative = isDesktopTauriRuntime()
  const [page, setPage] = useState<AppPage>('home')
  const [customizeSection, setCustomizeSection] = useState<string | null>(null)
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
  const [homeDir, setHomeDir] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>(__ZUNO_VERSION__)
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
  const radioAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastReportedPosRef = useRef<number>(-1)
  const [radioStore, setRadioStore] = useState<RadioStoreData>(DEFAULT_RADIO_STORE)
  const [fmHardware, setFmHardware] = useState<FmHardwareStatus | null>(null)
  const [activeRadio, setActiveRadio] = useState<ActiveRadioPlayback | null>(null)
  const [usingHtmlRadioFallback, setUsingHtmlRadioFallback] = useState(false)
  const [radioStationPool, setRadioStationPool] = useState<OnlineStation[]>(CURATED_ONLINE_STATIONS)
  const radioReqIdRef = useRef(0)
  const stepRadioStationRef = useRef<(dir: -1 | 1) => void>(() => {})
  const usingHtmlRadioFallbackRef = useRef(false)
  usingHtmlRadioFallbackRef.current = usingHtmlRadioFallback
  const [queueIds, setQueueIds] = useState<string[]>([])
  const [baseQueueIds, setBaseQueueIds] = useState<string[]>([])
  const [queueIndex, setQueueIndex] = useState<number | null>(null)
  const [activePlaylistLabel, setActivePlaylistLabel] = useState<string>('Songs')
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
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

  // Enable transparent root edges in frameless Tauri desktop mode only (never on Android/iOS)
  useEffect(() => {
    document.documentElement.classList.toggle('zuno-tauri-window', desktopNative)
  }, [desktopNative])

  // Sync native Android system bar + display cutout insets into `--zuno-inset-*` CSS variables
  useEffect(() => {
    if (!nativeAudio || desktopNative) return
    const bridge = getAndroidBridge()
    const rootStyle = document.documentElement.style
    let appliedTop = 0
    if (bridge?.getInsetsJson) {
      try {
        const parsed = JSON.parse(bridge.getInsetsJson()) as {
          top?: number
          bottom?: number
          left?: number
          right?: number
        }
        if (typeof parsed.top === 'number' && parsed.top > 0) {
          appliedTop = parsed.top
          rootStyle.setProperty('--zuno-inset-top', `${parsed.top}px`)
        }
        if (typeof parsed.bottom === 'number' && parsed.bottom > 0) {
          rootStyle.setProperty('--zuno-inset-bottom', `${parsed.bottom}px`)
        }
        if (typeof parsed.left === 'number' && parsed.left > 0) {
          rootStyle.setProperty('--zuno-inset-left', `${parsed.left}px`)
        }
        if (typeof parsed.right === 'number' && parsed.right > 0) {
          rootStyle.setProperty('--zuno-inset-right', `${parsed.right}px`)
        }
      } catch {
        // Fallback below handles unparsed insets safely
      }
    }
    // Safety floor on Android native WebViews before first WindowInsets callback arrives
    if (appliedTop === 0 && !rootStyle.getPropertyValue('--zuno-inset-top')) {
      rootStyle.setProperty('--zuno-inset-top', '36px')
    }
  }, [nativeAudio, desktopNative])

  // Apply appearance CSS custom properties live whenever settings change
  useEffect(() => {
    applyAppearanceToDom(appearance)
    saveAppearance(appearance)
    if (nativeAudio && !desktopNative) {
      getAndroidBridge()?.setSystemBarsLight?.(appearance.mode === 'light')
    }
  }, [appearance, nativeAudio, desktopNative])

  const uiZoomRef = useRef<number>(appearance.uiZoom)
  uiZoomRef.current = appearance.uiZoom

  // Apply Chrome-style display zoom via native Tauri WebviewWindow::set_zoom (or CSS zoom in web mode)
  useEffect(() => {
    zunoWindow.setZoom(appearance.uiZoom)
  }, [appearance.uiZoom])

  const adjustUiZoom = useCallback(
    (action: 'in' | 'out' | 'reset') => {
      const current = uiZoomRef.current ?? 100
      const next =
        action === 'reset'
          ? 100
          : clampUiZoom(current + (action === 'in' ? UI_ZOOM_STEP : -UI_ZOOM_STEP))
      if (next !== current) {
        setAppearance((prev) => ({ ...prev, uiZoom: next }))
      }
      notify(`Zoom: ${next}%`)
    },
    [notify],
  )

  // Chrome-style Ctrl + Mouse Wheel zoom in native desktop mode
  useEffect(() => {
    if (!nativeAudio) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.deltaY === 0) return
      e.preventDefault()
      adjustUiZoom(e.deltaY < 0 ? 'in' : 'out')
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [nativeAudio, adjustUiZoom])

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
      if (infoRes?.home_dir) setHomeDir(infoRes.home_dir)
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
        APPEARANCE_STORAGE_KEY,
        EQ_STORAGE_KEY,
        CUSTOM_FONT_STORAGE_KEY,
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
        const info = await zunoApi.checkUpdate(appVersion)
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
          setUpdateCheckError(formatError(err))
        }
      } finally {
        setUpdateChecking(false)
      }
    },
    [nativeAudio, appVersion, skippedVersion, notify],
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

  // Auto-rescan phone music folders right after the user grants Android audio storage permission
  useEffect(() => {
    const onGranted = () => {
      zunoApi
        .rescan()
        .then(() => refreshLibrary())
        .catch(() => {})
    }
    window.addEventListener('zuno:android-permission-granted', onGranted)
    return () => window.removeEventListener('zuno:android-permission-granted', onGranted)
  }, [refreshLibrary])

  // Load persisted FM Radio bookmarks (offline signal frequencies + online station marks & custom links)
  useEffect(() => {
    loadRadioStore()
      .then(setRadioStore)
      .catch(() => {})
  }, [])

  const updateRadioStore = useCallback(
    (updater: (prev: RadioStoreData) => RadioStoreData) => {
      setRadioStore((prev) => {
        const next = updater(prev)
        saveRadioStore(next).catch(() => {})
        return next
      })
    },
    [],
  )

  const refreshFmHardware = useCallback(() => {
    zunoApi
      .fmHardwareStatus()
      .then(setFmHardware)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (page === 'radio') {
      refreshFmHardware()
    }
  }, [page, refreshFmHardware])

  const clearHtmlRadioElement = useCallback(() => {
    const el = radioAudioRef.current
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
  }, [])

  const stopRadioPlayback = useCallback(
    (clearState = true) => {
      radioReqIdRef.current += 1
      clearHtmlRadioElement()
      if (nativeAudio) {
        const op = clearState ? zunoApi.radioStop() : zunoApi.radioDisconnect()
        op.catch(() => {})
        refreshFmHardware()
      }
      if (clearState) {
        setUsingHtmlRadioFallback(false)
        setActiveRadio(null)
      }
    },
    [clearHtmlRadioElement, nativeAudio, refreshFmHardware],
  )

  const pauseLocalSongs = useCallback(() => {
    if (nativeAudio) {
      zunoApi
        .pause()
        .then(() => setIsPlaying(false))
        .catch(() => {})
    } else if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
      suspendEqualizerContext(audioRef.current)
      setIsPlaying(false)
    }
  }, [nativeAudio])

  const startHtmlOnlineStream = useCallback(
    (stationId: string, stationName: string, url: string) => {
      const el = radioAudioRef.current
      if (!el) return
      el.pause()
      el.src = url
      el.volume = volume
      el.load()
      el.play().catch(() => {
        setActiveRadio((cur) =>
          cur && cur.id === stationId
            ? { ...cur, isPlaying: false, isBuffering: false, error: 'Stream failed to start' }
            : cur,
        )
        notify(`Unable to connect to ${stationName}`)
      })
    },
    [volume, notify],
  )

  const startOnlineRadioStream = useCallback(
    (opts: { id: string; name: string; subtitle: string; url: string }) => {
      const reqId = ++radioReqIdRef.current
      setActiveRadio({
        kind: 'online',
        id: opts.id,
        name: opts.name,
        subtitle: opts.subtitle,
        url: opts.url,
        isPlaying: false,
        isBuffering: true,
        error: null,
      })

      if (nativeAudio) {
        // Stream natively through Rust (Rodio + 10-band EQ + 1024-pt FFT + single MPRIS2 card)
        // so WebKitGTK never spawns a duplicate OS media notification.
        clearHtmlRadioElement()
        setIsPlaying(false)
        zunoApi
          .radioPlayOnline(opts)
          .then((info) => {
            if (reqId !== radioReqIdRef.current) return
            setUsingHtmlRadioFallback(false)
            setActiveRadio(nativeRadioToActive(info))
          })
          .catch((err) => {
            if (reqId !== radioReqIdRef.current) return
            const msg = formatError(err, 'Stream failed to start')
            if (msg === 'cancelled') return
            if (msg.includes('NO_NATIVE_STREAM_DECODER')) {
              setUsingHtmlRadioFallback(true)
              pauseLocalSongs()
              startHtmlOnlineStream(opts.id, opts.name, opts.url)
              return
            }
            setActiveRadio((cur) =>
              cur && cur.id === opts.id
                ? { ...cur, isPlaying: false, isBuffering: false, error: msg }
                : cur,
            )
            notify(`Unable to connect to ${opts.name}`)
          })
        return
      }

      pauseLocalSongs()
      startHtmlOnlineStream(opts.id, opts.name, opts.url)
    },
    [nativeAudio, clearHtmlRadioElement, pauseLocalSongs, startHtmlOnlineStream, notify],
  )

  const handlePlayOnlineStation = useCallback(
    (station: OnlineStation, pool: OnlineStation[]) => {
      if (pool.length > 0) {
        setRadioStationPool(pool)
      }
      const subtitle = [
        station.category,
        station.country,
        station.bitrate > 0 ? `${station.bitrate}k` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      startOnlineRadioStream({
        id: station.id,
        name: station.name,
        subtitle: subtitle || 'Online FM Stream',
        url: station.url,
      })
    },
    [startOnlineRadioStream],
  )

  const handleTuneOfflineSignal = useCallback(
    async (freqMhz: number, label?: string, signalId?: string) => {
      const cleanFreq = Math.round(freqMhz * 10) / 10
      radioReqIdRef.current += 1
      pauseLocalSongs()
      clearHtmlRadioElement()
      try {
        const hw = await zunoApi.fmTune(cleanFreq, { name: label, signalId })
        setFmHardware(hw)
        setUsingHtmlRadioFallback(false)
        setActiveRadio({
          kind: 'offline',
          id: signalId ?? `freq-${cleanFreq.toFixed(1)}`,
          name: label || formatMhz(cleanFreq),
          subtitle: `${formatMhz(cleanFreq)} · Offline FM Signal`,
          freqMhz: cleanFreq,
          isPlaying: true,
          isBuffering: false,
          error: null,
        })
        notify(`Tuned ${label ? `${label} (${formatMhz(cleanFreq)})` : formatMhz(cleanFreq)}`)
      } catch (err) {
        notify(formatError(err, 'No offline FM tuner hardware detected'))
        refreshFmHardware()
      }
    },
    [pauseLocalSongs, clearHtmlRadioElement, notify, refreshFmHardware],
  )

  const handleDisconnectRadio = useCallback(() => {
    radioReqIdRef.current += 1
    clearHtmlRadioElement()
    if (nativeAudio) {
      zunoApi
        .radioDisconnect()
        .then((info) => {
          if (info) setActiveRadio(nativeRadioToActive(info))
        })
        .catch(() => {})
      refreshFmHardware()
    }
    setActiveRadio((cur) =>
      cur ? { ...cur, isPlaying: false, isBuffering: false } : null,
    )
    notify('FM disconnected')
  }, [clearHtmlRadioElement, nativeAudio, refreshFmHardware, notify])

  const handleReconnectRadio = useCallback(() => {
    if (!activeRadio) return
    if (activeRadio.kind === 'online' && activeRadio.url) {
      const wasConnected = activeRadio.isPlaying || activeRadio.isBuffering
      startOnlineRadioStream({
        id: activeRadio.id,
        name: activeRadio.name,
        subtitle: activeRadio.subtitle,
        url: activeRadio.url,
      })
      notify(wasConnected ? `Reconnecting ${activeRadio.name}...` : `Connecting ${activeRadio.name}...`)
      return
    }
    if (activeRadio.kind === 'offline' && activeRadio.freqMhz !== undefined) {
      handleTuneOfflineSignal(activeRadio.freqMhz, activeRadio.name, activeRadio.id)
    }
  }, [activeRadio, startOnlineRadioStream, notify, handleTuneOfflineSignal])

  const handleToggleMarkOnline = useCallback(
    (stationId: string) => {
      updateRadioStore((prev) => {
        const exists = prev.marked_online_ids.includes(stationId)
        notify(exists ? 'Removed online station mark' : 'Marked online station')
        return {
          ...prev,
          marked_online_ids: exists
            ? prev.marked_online_ids.filter((id) => id !== stationId)
            : [stationId, ...prev.marked_online_ids],
        }
      })
    },
    [updateRadioStore, notify],
  )

  const handleAddCustomOnline = useCallback(
    (
      station: {
        name: string
        url: string
        country: string
        category: string
        tags: string[]
        bitrate: number
        codec: string
      },
      markImmediately: boolean,
    ): OnlineStation => {
      const id = `custom-${Date.now()}`
      const record = {
        id,
        name: station.name,
        url: station.url,
        category: station.category || 'Custom',
        country: station.country || 'Custom Link',
        language: '',
        tags: station.tags,
        bitrate: station.bitrate,
        codec: station.codec || 'STREAM',
        homepage: '',
        added_at: Math.floor(Date.now() / 1000),
      }
      updateRadioStore((prev) => ({
        ...prev,
        custom_online: [record, ...prev.custom_online],
        marked_online_ids:
          markImmediately && !prev.marked_online_ids.includes(id)
            ? [id, ...prev.marked_online_ids]
            : prev.marked_online_ids,
      }))
      notify(`Saved "${station.name}"`)
      return {
        id,
        name: record.name,
        url: record.url,
        category: 'Custom',
        country: record.country,
        language: record.language,
        tags: record.tags,
        bitrate: record.bitrate,
        codec: record.codec,
        isCustom: true,
        addedAt: record.added_at,
      }
    },
    [updateRadioStore, notify],
  )

  const handleDeleteCustomOnline = useCallback(
    (stationId: string) => {
      if (activeRadio?.kind === 'online' && activeRadio.id === stationId) {
        stopRadioPlayback()
      }
      updateRadioStore((prev) => ({
        ...prev,
        custom_online: prev.custom_online.filter((s) => s.id !== stationId),
        marked_online_ids: prev.marked_online_ids.filter((id) => id !== stationId),
      }))
      notify('Removed custom station link')
    },
    [activeRadio, stopRadioPlayback, updateRadioStore, notify],
  )

  const handleSaveDiscoveredStation = useCallback(
    (st: DiscoveredStation) => {
      const record = {
        id: st.id,
        name: st.name,
        url: st.url,
        category: 'Custom',
        country: st.country || 'Global',
        language: st.language,
        tags: st.tags,
        bitrate: st.bitrate,
        codec: st.codec || 'STREAM',
        homepage: st.homepage,
        added_at: Math.floor(Date.now() / 1000),
      }
      updateRadioStore((prev) => {
        const exists = prev.custom_online.some(
          (c) => c.id === st.id || c.url.trim().toLowerCase() === st.url.trim().toLowerCase(),
        )
        return {
          ...prev,
          custom_online: exists ? prev.custom_online : [record, ...prev.custom_online],
          marked_online_ids: prev.marked_online_ids.includes(st.id)
            ? prev.marked_online_ids
            : [st.id, ...prev.marked_online_ids],
        }
      })
      notify(`Saved & marked "${st.name}"`)
    },
    [updateRadioStore, notify],
  )

  const handleChangeBand = useCallback(
    (band: FmBandId) => {
      updateRadioStore((prev) => ({
        ...prev,
        band,
        last_freq_mhz: clampFreqToBand(prev.last_freq_mhz, band),
      }))
    },
    [updateRadioStore],
  )

  const handleChangeDialFreq = useCallback(
    (freqMhz: number) => {
      updateRadioStore((prev) => ({
        ...prev,
        last_freq_mhz: clampFreqToBand(freqMhz, prev.band),
      }))
    },
    [updateRadioStore],
  )

  const handleUpsertOfflineSignal = useCallback(
    (signal: Omit<OfflineSignalStation, 'id' | 'created_at'>, existingId?: string) => {
      updateRadioStore((prev) => {
        if (existingId) {
          return {
            ...prev,
            offline_signals: prev.offline_signals.map((s) =>
              s.id === existingId ? { ...s, ...signal } : s,
            ),
          }
        }
        const created: OfflineSignalStation = {
          ...signal,
          id: `sig-${Date.now()}`,
          created_at: Math.floor(Date.now() / 1000),
        }
        return {
          ...prev,
          offline_signals: [...prev.offline_signals, created],
        }
      })
      notify(
        existingId
          ? `Updated ${signal.name} (${formatMhz(signal.freq_mhz)})`
          : `Marked ${signal.name} (${formatMhz(signal.freq_mhz)})`,
      )
    },
    [updateRadioStore, notify],
  )

  const handleToggleMarkOffline = useCallback(
    (signalId: string) => {
      updateRadioStore((prev) => {
        const target = prev.offline_signals.find((s) => s.id === signalId)
        if (target) {
          notify(target.marked ? 'Removed signal mark' : 'Marked offline signal')
        }
        return {
          ...prev,
          offline_signals: prev.offline_signals.map((s) =>
            s.id === signalId ? { ...s, marked: !s.marked } : s,
          ),
        }
      })
    },
    [updateRadioStore, notify],
  )

  const handleDeleteOfflineSignal = useCallback(
    (signalId: string) => {
      updateRadioStore((prev) => ({
        ...prev,
        offline_signals: prev.offline_signals.filter((s) => s.id !== signalId),
      }))
      notify('Removed offline FM frequency')
    },
    [updateRadioStore, notify],
  )

  const searchReqIdRef = useRef(0)

  useEffect(() => {
    const q = searchQuery.trim()
    const reqId = ++searchReqIdRef.current
    if (!q) {
      setSearchResults(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const res = await zunoApi.searchSongs(q)
        if (!cancelled && reqId === searchReqIdRef.current) {
          setSearchResults(res.tracks)
        }
      } catch {
        if (!cancelled && reqId === searchReqIdRef.current) {
          setSearchResults([])
        }
      }
    }, 90)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery])

  const remoteVolumeRef = useRef<number | null>(null)
  const volumeRef = useRef<number>(volume)
  volumeRef.current = volume

  useEffect(() => {
    if (nativeAudio) {
      if (
        remoteVolumeRef.current !== null &&
        Math.abs(remoteVolumeRef.current - volume) < 0.005
      ) {
        remoteVolumeRef.current = null
      } else {
        zunoApi.setVolume(volume).catch(() => {})
      }
    } else if (audioRef.current) {
      audioRef.current.volume = volume
    }
    if (radioAudioRef.current) {
      radioAudioRef.current.volume = volume
    }
  }, [volume, nativeAudio])

  const lastNativeTrackIdRef = useRef<string | null>(null)
  const queueIdsRef = useRef<string[]>([])
  queueIdsRef.current = queueIds

  // Live two-way sync refs between React UI and ~/zuno/.zuno/settings.json (for MCP control)
  const settingsReadyRef = useRef(false)
  const applyingRemoteSettingsRef = useRef(false)
  const lastSettingsRevRef = useRef(0)
  const lastLibraryRevRef = useRef(0)
  const lastRadioStoreRevRef = useRef(0)
  const appearanceRef = useRef(appearance)
  appearanceRef.current = appearance
  const eqSettingsRef = useRef(eqSettings)
  eqSettingsRef.current = eqSettings
  const sortPrefRef = useRef(sortPref)
  sortPrefRef.current = sortPref
  const lastPlayedIdsRef = useRef(lastPlayedIds)
  lastPlayedIdsRef.current = lastPlayedIds
  const autoCheckUpdatesRef = useRef(autoCheckUpdates)
  autoCheckUpdatesRef.current = autoCheckUpdates
  const skippedVersionRef = useRef(skippedVersion)
  skippedVersionRef.current = skippedVersion

  const hydrateFromBackendSettings = useCallback((remote: PersistedAppSettings) => {
    applyingRemoteSettingsRef.current = true
    lastSettingsRevRef.current = remote.revision

    if (remote.appearance && typeof remote.appearance === 'object') {
      const nextApp: AppearanceSettings = {
        ...DEFAULT_APPEARANCE,
        ...(remote.appearance as Partial<AppearanceSettings>),
        customColors:
          remote.appearance.customColors &&
          typeof remote.appearance.customColors === 'object'
            ? (remote.appearance.customColors as AppearanceSettings['customColors'])
            : {},
        uiZoom:
          typeof remote.appearance.uiZoom === 'number'
            ? clampUiZoom(remote.appearance.uiZoom)
            : DEFAULT_APPEARANCE.uiZoom,
      }
      if (JSON.stringify(nextApp) !== JSON.stringify(appearanceRef.current)) {
        setAppearance(nextApp)
      }
    }

    if (remote.eq && typeof remote.eq === 'object') {
      const rawEq = remote.eq as Partial<EqSettings>
      const nextEq: EqSettings = {
        ...DEFAULT_EQ_SETTINGS,
        ...rawEq,
        bands:
          Array.isArray(rawEq.bands) && rawEq.bands.length === EQ_BANDS.length
            ? rawEq.bands
            : DEFAULT_EQ_SETTINGS.bands,
        customPresets: Array.isArray(rawEq.customPresets) ? rawEq.customPresets : [],
      }
      if (JSON.stringify(nextEq) !== JSON.stringify(eqSettingsRef.current)) {
        setEqSettings(nextEq)
      }
    }

    if (remote.sort_pref && typeof remote.sort_pref === 'object') {
      const f = remote.sort_pref.field as SortField | undefined
      const d = remote.sort_pref.dir as SortDir | undefined
      if (
        f &&
        VALID_SORT_FIELDS.includes(f) &&
        (d === 'asc' || d === 'desc') &&
        (f !== sortPrefRef.current.field || d !== sortPrefRef.current.dir)
      ) {
        const nextSort = { field: f, dir: d }
        setSortPref(nextSort)
        try {
          localStorage.setItem(SORT_PREF_KEY, JSON.stringify(nextSort))
        } catch {
          /* ignore */
        }
      }
    }

    if (Array.isArray(remote.last_played_ids)) {
      const nextIds = remote.last_played_ids.filter((x): x is string => typeof x === 'string')
      if (JSON.stringify(nextIds) !== JSON.stringify(lastPlayedIdsRef.current)) {
        setLastPlayedIds(nextIds)
        try {
          localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(nextIds))
        } catch {
          /* ignore */
        }
      }
    }

    if (
      typeof remote.auto_check_updates === 'boolean' &&
      remote.auto_check_updates !== autoCheckUpdatesRef.current
    ) {
      setAutoCheckUpdates(remote.auto_check_updates)
      try {
        localStorage.setItem(AUTO_CHECK_UPDATES_KEY, String(remote.auto_check_updates))
      } catch {
        /* ignore */
      }
    }

    const nextSkipped = remote.skipped_update_version ?? null
    if (nextSkipped !== skippedVersionRef.current) {
      setSkippedVersion(nextSkipped)
      try {
        if (nextSkipped) localStorage.setItem(SKIPPED_UPDATE_KEY, nextSkipped)
        else localStorage.removeItem(SKIPPED_UPDATE_KEY)
      } catch {
        /* ignore */
      }
    }

    window.setTimeout(() => {
      applyingRemoteSettingsRef.current = false
    }, 0)
  }, [])

  // Boot hydration: sync ~/zuno/.zuno/settings.json <-> React UI (preserving existing localStorage on first upgrade)
  useEffect(() => {
    let cancelled = false
    Promise.all([zunoApi.getSettings().catch(() => null), zunoApi.syncPoll().catch(() => null)])
      .then(([res, sync]) => {
        if (cancelled) return
        if (sync) {
          lastLibraryRevRef.current = sync.library_rev
          lastRadioStoreRevRef.current = sync.radio_store_rev
        }
        if (res?.settings) {
          if (res.settings.revision > 0) {
            hydrateFromBackendSettings(res.settings)
          } else {
            // Seed ~/zuno/.zuno/settings.json from existing localStorage on first run
            zunoApi
              .updateSettings({
                appearance: appearanceRef.current as unknown as Record<string, unknown>,
                eq: eqSettingsRef.current as unknown as Record<string, unknown>,
                sort_pref: sortPrefRef.current,
                last_played_ids: lastPlayedIdsRef.current,
                auto_check_updates: autoCheckUpdatesRef.current,
                skipped_update_version: skippedVersionRef.current,
              })
              .then((saved) => {
                if (!cancelled && saved?.settings) {
                  lastSettingsRevRef.current = saved.settings.revision
                }
              })
              .catch(() => {})
          }
        }
        settingsReadyRef.current = true
      })
      .catch(() => {
        settingsReadyRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [hydrateFromBackendSettings])

  // Persist user-driven UI settings changes into ~/zuno/.zuno/settings.json so MCP agents always read current state
  useEffect(() => {
    if (!settingsReadyRef.current || applyingRemoteSettingsRef.current) return
    const timer = window.setTimeout(() => {
      if (applyingRemoteSettingsRef.current) return
      zunoApi
        .updateSettings({
          appearance: appearance as unknown as Record<string, unknown>,
          eq: eqSettings as unknown as Record<string, unknown>,
          sort_pref: sortPref,
          auto_check_updates: autoCheckUpdates,
          skipped_update_version: skippedVersion,
        })
        .then((res) => {
          if (res?.settings) {
            lastSettingsRevRef.current = Math.max(
              lastSettingsRevRef.current,
              res.settings.revision,
            )
          }
        })
        .catch(() => {})
    }, 120)
    return () => window.clearTimeout(timer)
  }, [appearance, eqSettings, sortPref, autoCheckUpdates, skippedVersion])

  const applyUiCommands = useCallback(
    (commands: UiCommand[]) => {
      for (const cmd of commands) {
        if (cmd.overlay) {
          const ov = cmd.overlay.toLowerCase()
          if (ov === 'search') {
            setMobilePlayerOpen(false)
            setFoldersOpen(false)
            setUpdateDialogOpen(false)
            if (typeof cmd.search_query === 'string') {
              setSearchQuery(cmd.search_query)
            }
            setSearchOpen(true)
          } else if (ov === 'folders') {
            setSearchOpen(false)
            setUpdateDialogOpen(false)
            setFoldersOpen(true)
          } else if (ov === 'update_dialog') {
            setSearchOpen(false)
            setFoldersOpen(false)
            setUpdateDialogOpen(true)
          } else if (ov === 'close') {
            setSearchOpen(false)
            setFoldersOpen(false)
            setUpdateDialogOpen(false)
            setMobilePlayerOpen(false)
          }
        }
        if (cmd.page) {
          const target = cmd.page.toLowerCase()
          setSearchOpen(false)
          if (target === 'playing') {
            setMobilePlayerOpen(true)
          } else if (target === 'playlist' && cmd.playlist_slug) {
            setMobilePlayerOpen(false)
            setListCtx({ kind: 'playlist', slug: cmd.playlist_slug })
            setPlaylistSort({ field: 'default', dir: 'asc' })
            setPage('playlist')
          } else if (target === 'customize') {
            setMobilePlayerOpen(false)
            setCustomizeSection(cmd.customize_section ?? null)
            setPage('customize')
          } else if (
            target === 'home' ||
            target === 'recent' ||
            target === 'playlists' ||
            target === 'radio' ||
            target === 'equalizer'
          ) {
            setMobilePlayerOpen(false)
            if (target === 'home') setListCtx({ kind: 'all' })
            setPage(target)
          }
        }
      }
    },
    [],
  )

  const applyNativeStatus = useCallback((st: PlaybackStatus) => {
    setIsPlaying(st.state === 'playing')
    setPosition(st.position_secs)
    if (st.duration_secs > 0) setDuration(st.duration_secs)
    if (Math.abs(st.volume - volumeRef.current) > 0.005) {
      remoteVolumeRef.current = st.volume
      setVolume(st.volume)
    }
    setShuffle(st.shuffle)
    setRepeat(st.repeat)
    if (st.queue_index !== null) setQueueIndex(st.queue_index)
    if (st.active_playlist) setActivePlaylistLabel(st.active_playlist)
    const tid = st.current_track?.id ?? null
    // If playback changed externally (MPRIS media keys, GNOME banner, tray, CLI, MCP), sync queue!
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
        const next = [tid, ...prev.filter((x) => x !== tid)].slice(0, LAST_PLAYED_MAX)
        try {
          localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    }
  }, [])

  // In native Tauri mode, restore live Rust playback, queue & active FM radio on window open/recreate
  useEffect(() => {
    if (!nativeAudio) return
    let cancelled = false
    Promise.all([zunoApi.getStatus(), zunoApi.queueGet(), zunoApi.radioPoll()])
      .then(([st, q, radioRes]) => {
        if (cancelled) return
        remoteVolumeRef.current = st.volume
        setVolume(st.volume)
        if (q.tracks.length > 0) {
          const ids = q.tracks.map((t) => t.id)
          setQueueIds(ids)
          setBaseQueueIds(ids)
        }
        applyNativeStatus(st)
        if (radioRes?.active) {
          setActiveRadio(nativeRadioToActive(radioRes.active))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [nativeAudio, applyNativeStatus])

  const hasLiveNativePlayback =
    isPlaying || Boolean(activeRadio?.isPlaying || activeRadio?.isBuffering)

  // Lightweight in-process status + radio + MCP settings/UI sync while visible in Tauri mode
  useEffect(() => {
    if (!nativeAudio) return
    let cancelled = false
    let timer = 0
    const poll = () => {
      if (cancelled) return
      if (document.hidden) {
        timer = window.setTimeout(poll, 1200)
        return
      }
      Promise.all([zunoApi.getStatus(), zunoApi.radioPoll(), zunoApi.syncPoll()])
        .then(([st, radioRes, syncRes]) => {
          if (cancelled) return
          applyNativeStatus(st)
          if (radioRes && !usingHtmlRadioFallbackRef.current) {
            const nextRadio = radioRes.active ? nativeRadioToActive(radioRes.active) : null
            setActiveRadio((cur) => (sameActiveRadio(cur, nextRadio) ? cur : nextRadio))
            if (radioRes.step_delta !== 0) {
              stepRadioStationRef.current(radioRes.step_delta > 0 ? 1 : -1)
            }
          }
          if (syncRes) {
            if (syncRes.settings_rev > lastSettingsRevRef.current) {
              lastSettingsRevRef.current = syncRes.settings_rev
              zunoApi
                .getSettings()
                .then((res) => {
                  if (!cancelled && res?.settings) {
                    hydrateFromBackendSettings(res.settings)
                  }
                })
                .catch(() => {})
            }
            if (syncRes.library_rev > lastLibraryRevRef.current) {
              lastLibraryRevRef.current = syncRes.library_rev
              refreshLibrary()
            }
            if (syncRes.radio_store_rev > lastRadioStoreRevRef.current) {
              lastRadioStoreRevRef.current = syncRes.radio_store_rev
              loadRadioStore()
                .then((store) => {
                  if (!cancelled) setRadioStore(store)
                })
                .catch(() => {})
            }
            if (syncRes.ui_commands.length > 0) {
              applyUiCommands(syncRes.ui_commands)
            }
          }
          const fast =
            st.state === 'playing' ||
            radioRes?.active?.state === 'playing' ||
            radioRes?.active?.state === 'connecting'
          timer = window.setTimeout(poll, fast ? 350 : 900)
        })
        .catch(() => {
          if (cancelled) return
          timer = window.setTimeout(poll, 2000)
        })
    }
    timer = window.setTimeout(poll, hasLiveNativePlayback ? 350 : 900)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    nativeAudio,
    hasLiveNativePlayback,
    applyNativeStatus,
    hydrateFromBackendSettings,
    refreshLibrary,
    applyUiCommands,
  ])

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
        .slice(0, LAST_PLAYED_MAX),
    [lastPlayedIds, trackById],
  )

  const recordPlayed = useCallback((id: string) => {
    setLastPlayedIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, LAST_PLAYED_MAX)
      try {
        localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const favoritesPlaylist = useMemo(
    () => playlists.find(isFavoritesPlaylist) ?? null,
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
      stopRadioPlayback()
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
    [shuffle, playTrackById, nativeAudio, applyNativeStatus, stopRadioPlayback],
  )

  const handleTogglePlay = useCallback(() => {
    if (activeRadio) {
      if (activeRadio.isPlaying || activeRadio.isBuffering) {
        handleDisconnectRadio()
      } else {
        handleReconnectRadio()
      }
      return
    }
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
    activeRadio,
    handleDisconnectRadio,
    handleReconnectRadio,
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
      if (!activeRadio && currentTrack?.id === track.id) {
        handleTogglePlay()
        return
      }
      stopRadioPlayback()
      startQueue(
        subset.map((x) => x.id),
        track.id,
        label,
        undefined,
        sourceKey,
      )
    },
    [activeRadio, currentTrack, handleTogglePlay, stopRadioPlayback, startQueue],
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
        zunoApi
          .updateSettings({ last_played_ids: next })
          .then((res) => {
            if (res?.settings) {
              lastSettingsRevRef.current = Math.max(
                lastSettingsRevRef.current,
                res.settings.revision,
              )
            }
          })
          .catch(() => {})
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
    zunoApi.clearLastPlayed().catch(() => {})
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

  // Refs keep playback position/duration/track current inside the global keydown handler
  // without tearing down and re-registering `window.addEventListener('keydown')` 3–4×/sec.
  const positionRef = useRef(position)
  positionRef.current = position
  const durationRef = useRef(duration)
  durationRef.current = duration
  const currentTrackRef = useRef(currentTrack)
  currentTrackRef.current = currentTrack

  useEffect(() => {
    const stopPlayback = () => {
      if (nativeAudio) {
        zunoApi.stop().then(applyNativeStatus).catch(() => {})
      } else if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        setIsPlaying(false)
        setPosition(0)
      }
    }

    const mediaKeyActions: Record<string, () => void> = {
      MediaPlayPause: handleTogglePlay,
      MediaTrackNext: () => handleNext(false),
      MediaTrackPrevious: handlePrev,
      MediaStop: stopPlayback,
    }

    const singleKeyActions: Record<string, () => void> = {
      m: () => setVolume((v) => (v > MUTE_EPSILON ? 0 : DEFAULT_VOLUME)),
      s: handleToggleShuffle,
      r: handleCycleRepeat,
    }

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
      const mediaAction = mediaKeyActions[e.key] ?? mediaKeyActions[e.code]
      if (mediaAction) {
        e.preventDefault()
        mediaAction()
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
        if (lower === 'q' && desktopNative) {
          e.preventDefault()
          zunoWindow.quit()
          return
        }
        // Chrome-style Zoom shortcuts: Ctrl/Cmd + / - / 0
        const zoomAction: 'in' | 'out' | 'reset' | null =
          e.key === '+' || e.key === '=' || e.code === 'NumpadAdd'
            ? 'in'
            : e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract'
              ? 'out'
              : e.key === '0' || e.code === 'Numpad0'
                ? 'reset'
                : null
        if (zoomAction) {
          e.preventDefault()
          adjustUiZoom(zoomAction)
          return
        }
        // Never intercept other system Ctrl/Super combos (Ctrl+C, Super+Space, Ctrl+Alt+T, etc.)
        return
      }

      // Never intercept Alt / Super system window manager shortcuts (Alt+Space, Alt+Tab, Alt+F4, etc.)
      if (hasModifier) return

      if (e.key === 'F11' && desktopNative) {
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
          const curPos = positionRef.current
          const curDur = durationRef.current
          const maxDur = curDur > 0 ? curDur : (currentTrackRef.current?.duration_secs ?? 0)
          const targetPos = Math.min(maxDur > 0 ? maxDur : curPos + 5, curPos + 5)
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
          const targetPos = Math.max(0, positionRef.current - 5)
          setPosition(targetPos)
          handleSeekCommit(targetPos)
        }
        return
      }

      if (!e.shiftKey) {
        const action = singleKeyActions[e.key.toLowerCase()]
        if (action) {
          e.preventDefault()
          action()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    nativeAudio,
    applyNativeStatus,
    handleTogglePlay,
    handleNext,
    handlePrev,
    handleSeekCommit,
    handleToggleShuffle,
    handleCycleRepeat,
    adjustUiZoom,
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

  const offlineSignalByFreq = useMemo(
    () => new Map(radioStore.offline_signals.map((s) => [freqToDeciMhz(s.freq_mhz), s])),
    [radioStore.offline_signals],
  )

  const stepRadioStation = useCallback(
    (dir: -1 | 1) => {
      if (!activeRadio) return
      if (activeRadio.kind === 'online') {
        const pool =
          radioStationPool.length > 0 ? radioStationPool : mergeOnlineStations(radioStore)
        if (pool.length === 0) return
        const curIdx = pool.findIndex((s) => s.id === activeRadio.id)
        const nextIdx =
          curIdx === -1 ? 0 : (curIdx + dir + pool.length) % pool.length
        handlePlayOnlineStation(pool[nextIdx], pool)
        return
      }
      const spec = FM_BANDS[radioStore.band]
      const nextFreq = clampFreqToBand(
        (activeRadio.freqMhz ?? radioStore.last_freq_mhz) + dir * spec.stepMhz,
        radioStore.band,
      )
      handleChangeDialFreq(nextFreq)
      const hit = offlineSignalByFreq.get(freqToDeciMhz(nextFreq))
      handleTuneOfflineSignal(nextFreq, hit?.name, hit?.id)
    },
    [
      activeRadio,
      radioStationPool,
      radioStore,
      offlineSignalByFreq,
      handlePlayOnlineStation,
      handleChangeDialFreq,
      handleTuneOfflineSignal,
    ],
  )

  stepRadioStationRef.current = stepRadioStation

  const displayTrack: Track | null = useMemo(() => {
    if (!activeRadio) return currentTrack
    return {
      id: activeRadio.id,
      rel_path: activeRadio.url ?? '',
      title: activeRadio.name,
      artist: activeRadio.subtitle,
      album: activeRadio.kind === 'offline' ? 'Offline FM' : 'Online FM',
      genre: 'FM Radio',
      duration_secs: 0,
      file_size: 0,
      modified_secs: 0,
      folder: '',
      has_cover: false,
    }
  }, [activeRadio, currentTrack])

  const displayIsPlaying = activeRadio ? activeRadio.isPlaying : isPlaying
  const displayIsBuffering = Boolean(activeRadio?.isBuffering)
  const displayLiveLabel = activeRadio
    ? activeRadio.kind === 'offline'
      ? activeRadio.isPlaying
        ? `SIGNAL · ${formatMhz(activeRadio.freqMhz ?? radioStore.last_freq_mhz)}`
        : `DISCONNECTED · ${formatMhz(activeRadio.freqMhz ?? radioStore.last_freq_mhz)}`
      : activeRadio.isBuffering
        ? 'CONNECTING · ONLINE FM'
        : activeRadio.isPlaying
          ? 'LIVE · ONLINE FM'
          : 'DISCONNECTED · ONLINE FM'
    : null

  const displayIsFavorite = useMemo(() => {
    if (!activeRadio) return isCurrentFavorite
    if (activeRadio.kind === 'online') {
      return radioStore.marked_online_ids.includes(activeRadio.id)
    }
    const freq = activeRadio.freqMhz ?? radioStore.last_freq_mhz
    return Boolean(offlineSignalByFreq.get(freqToDeciMhz(freq))?.marked)
  }, [activeRadio, isCurrentFavorite, radioStore.marked_online_ids, radioStore.last_freq_mhz, offlineSignalByFreq])

  const displayToggleFavorite = useCallback(() => {
    if (!activeRadio) {
      handleToggleFavorite()
      return
    }
    if (activeRadio.kind === 'online') {
      handleToggleMarkOnline(activeRadio.id)
      return
    }
    const freq = activeRadio.freqMhz ?? radioStore.last_freq_mhz
    const existing = offlineSignalByFreq.get(freqToDeciMhz(freq))
    if (existing) {
      handleToggleMarkOffline(existing.id)
    } else {
      handleUpsertOfflineSignal({
        freq_mhz: freq,
        name: activeRadio.name,
        region: '',
        genre: 'FM',
        notes: '',
        band: radioStore.band,
        marked: true,
      })
    }
  }, [
    activeRadio,
    handleToggleFavorite,
    handleToggleMarkOnline,
    radioStore.last_freq_mhz,
    radioStore.band,
    offlineSignalByFreq,
    handleToggleMarkOffline,
    handleUpsertOfflineSignal,
  ])

  const displayPrev = useCallback(() => {
    if (activeRadio) {
      stepRadioStation(-1)
      return
    }
    handlePrev()
  }, [activeRadio, stepRadioStation, handlePrev])

  const displayNext = useCallback(() => {
    if (activeRadio) {
      stepRadioStation(1)
      return
    }
    handleNext(false)
  }, [activeRadio, stepRadioStation, handleNext])

  // Unified Browser Media Session API for web/mobile mode (handles both songs & FM in one card;
  // native desktop uses Rust's unified MPRIS2 server directly).
  useEffect(() => {
    if (nativeAudio || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return
    }
    const ms = navigator.mediaSession
    if (displayTrack) {
      const artist = displayArtist(displayTrack)
      const artwork = activeRadio
        ? [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
        : displayTrack.has_cover
          ? [{ src: zunoApi.coverUrl(displayTrack.id) }]
          : [{ src: '/default-music-cover.png', sizes: '512x512', type: 'image/png' }]
      ms.metadata = new MediaMetadata({
        title: displayTrack.title,
        artist,
        album: displayTrack.album || displayTrack.folder || 'Zuno',
        artwork,
      })
    } else {
      ms.metadata = null
    }
    ms.playbackState = displayTrack
      ? displayIsPlaying || displayIsBuffering
        ? 'playing'
        : 'paused'
      : 'none'
  }, [nativeAudio, activeRadio, displayTrack, displayIsPlaying, displayIsBuffering])

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
      if (!displayIsPlaying) handleTogglePlay()
    })
    safeSet('pause', () => {
      if (displayIsPlaying) handleTogglePlay()
    })
    safeSet('previoustrack', () => displayPrev())
    safeSet('nexttrack', () => displayNext())
    safeSet(
      'seekto',
      activeRadio
        ? null
        : (details) => {
            if (typeof details.seekTime === 'number') {
              setPosition(details.seekTime)
              handleSeekCommit(details.seekTime)
            }
          },
    )
    return () => {
      safeSet('play', null)
      safeSet('pause', null)
      safeSet('previoustrack', null)
      safeSet('nexttrack', null)
      safeSet('seekto', null)
    }
  }, [
    nativeAudio,
    activeRadio,
    displayIsPlaying,
    handleTogglePlay,
    displayPrev,
    displayNext,
    handleSeekCommit,
  ])

  const nowPlayingProps = {
    track: displayTrack,
    queueTracks,
    queueIndex,
    playlistLabel: activeRadio
      ? activeRadio.kind === 'offline'
        ? 'Offline FM Signal'
        : 'Online FM Radio'
      : activePlaylistLabel,
    isPlaying: displayIsPlaying,
    isFavorite: displayIsFavorite,
    liveLabel: displayLiveLabel,
    isBuffering: displayIsBuffering,
    radioDemoVisualizer:
      activeRadio?.kind === 'online' && (!nativeAudio || usingHtmlRadioFallback),
    position,
    duration,
    volume,
    shuffle,
    repeat,
    playlists,
    onTogglePlay: handleTogglePlay,
    onReconnectRadio: handleReconnectRadio,
    onDisconnectRadio: handleDisconnectRadio,
    onPrev: displayPrev,
    onNext: displayNext,
    onSeekChange: setPosition,
    onSeekCommit: handleSeekCommit,
    onVolumeChange: setVolume,
    onToggleFavorite: displayToggleFavorite,
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

  const roundedFrame = desktopNative && !windowMaximized

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
        currentTrack={displayTrack}
        isPlaying={displayIsPlaying}
        onMaximizedChange={setWindowMaximized}
      />

      <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
      {/* Dedicated Online FM Radio audio element (works in both Tauri WebView & Web Browser) */}
      <audio
        ref={radioAudioRef}
        preload="none"
        onPlaying={() => {
          setActiveRadio((cur) =>
            cur && cur.kind === 'online'
              ? { ...cur, isPlaying: true, isBuffering: false, error: null }
              : cur,
          )
        }}
        onWaiting={() => {
          setActiveRadio((cur) =>
            cur && cur.kind === 'online' ? { ...cur, isBuffering: true } : cur,
          )
        }}
        onPause={() => {
          setActiveRadio((cur) =>
            cur && cur.kind === 'online'
              ? { ...cur, isPlaying: false, isBuffering: false }
              : cur,
          )
        }}
        onError={() => {
          setActiveRadio((cur) => {
            if (!cur || cur.kind !== 'online' || !cur.url) return cur
            notify(`Stream unavailable: ${cur.name}`)
            return { ...cur, isPlaying: false, isBuffering: false, error: 'Stream unavailable' }
          })
        }}
      />

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
              } else if (el.volume !== volume) {
                el.volume = volume
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
          radioActive={Boolean(activeRadio?.isPlaying)}
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
          onGoRadio={() => {
            setSearchOpen(false)
            setPage('radio')
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
          radioActive={Boolean(activeRadio?.isPlaying)}
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
          onGoRadio={() => {
            setSearchOpen(false)
            setPage('radio')
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
          radioActive={Boolean(activeRadio?.isPlaying)}
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
          onGoRadio={() => {
            setSearchOpen(false)
            setPage('radio')
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

          {page === 'radio' && (
            <RadioPage
              store={radioStore}
              activeRadio={activeRadio}
              fmHardware={fmHardware}
              appearance={appearance}
              onRefreshHardware={refreshFmHardware}
              onPlayOnlineStation={handlePlayOnlineStation}
              onReconnectRadio={handleReconnectRadio}
              onDisconnectRadio={handleDisconnectRadio}
              onStopRadio={() => stopRadioPlayback()}
              onToggleMarkOnline={handleToggleMarkOnline}
              onAddCustomOnline={handleAddCustomOnline}
              onDeleteCustomOnline={handleDeleteCustomOnline}
              onSaveDiscoveredStation={handleSaveDiscoveredStation}
              onChangeBand={handleChangeBand}
              onChangeDialFreq={handleChangeDialFreq}
              onTuneOfflineSignal={handleTuneOfflineSignal}
              onUpsertOfflineSignal={handleUpsertOfflineSignal}
              onToggleMarkOffline={handleToggleMarkOffline}
              onDeleteOfflineSignal={handleDeleteOfflineSignal}
              onExpandNowPlaying={() => setMobilePlayerOpen(true)}
            />
          )}

          {page === 'equalizer' && (
            <EqualizerPage
              settings={eqSettings}
              isPlaying={displayIsPlaying}
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
          track={displayTrack}
          isPlaying={displayIsPlaying}
          isFavorite={displayIsFavorite}
          liveLabel={displayLiveLabel}
          isBuffering={displayIsBuffering}
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
          onReconnectRadio={handleReconnectRadio}
          onDisconnectRadio={handleDisconnectRadio}
          onPrev={displayPrev}
          onNext={displayNext}
          onSeekChange={setPosition}
          onSeekCommit={handleSeekCommit}
          onVolumeChange={setVolume}
          onToggleFavorite={displayToggleFavorite}
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
          track={displayTrack}
          isPlaying={displayIsPlaying}
          isFavorite={displayIsFavorite}
          isRadio={Boolean(activeRadio)}
          isBuffering={displayIsBuffering}
          appearance={appearance}
          onTogglePlay={handleTogglePlay}
          onReconnectRadio={handleReconnectRadio}
          onDisconnectRadio={handleDisconnectRadio}
          onToggleFavorite={displayToggleFavorite}
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
            section={customizeSection}
            onChange={updateAppearance}
            onReset={resetAppearance}
            onBack={() => {
              setCustomizeSection(null)
              setPage(lastNonCustomizePageRef.current)
            }}
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
        homeDir={homeDir}
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
        homeDir={homeDir}
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
