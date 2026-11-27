import { clampUiZoom } from '@/lib/appearance'
import { isHlsStreamUrl } from '@/lib/radioUrl'
import type {
  DiscoveredStation,
  FmHardwareStatus,
  RadioStoreData,
  ResolvedStreamInfo,
} from '@/lib/radioStore'

export interface Track {
  id: string
  rel_path: string
  title: string
  artist: string
  album: string
  genre: string | null
  duration_secs: number
  file_size: number
  modified_secs: number
  folder: string
  source_dir?: string | null
  has_cover: boolean
}

export interface FolderSummary {
  name: string
  track_count: number
  total_duration_secs: number
}

export interface MusicSource {
  path: string
  label: string
  is_default: boolean
  exists: boolean
  track_count: number
}

export interface Playlist {
  slug: string
  title: string
  file_name: string
  track_ids: string[]
  missing_entries: string[]
  healed_count: number
}

export type RepeatMode = 'off' | 'one' | 'all'
export type PlayState = 'stopped' | 'playing' | 'paused'

export interface PlaybackStatus {
  state: PlayState
  current_track: Track | null
  position_secs: number
  duration_secs: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  queue_len: number
  queue_index: number | null
  active_playlist: string | null
}

export interface ServerInfo {
  root_dir: string
  songs_dir: string
  playlists_dir: string
  home_dir?: string | null
  suggested_dirs?: string[]
  mcp_http_url: string
  version: string
}

export interface AudioLevels {
  bands: number[]
  bass: number
  mid: number
  treble: number
  energy: number
}

export interface UpdateInfo {
  current_version: string
  latest_version: string
  update_available: boolean
  tag: string
  release_url: string
  published_at: string
  notes: string
  target: string
  download_url: string | null
  sha256: string | null
  size_bytes: number | null
  can_auto_install: boolean
  install_path: string
}

export interface BackupReport {
  backup_path: string
  files_count: number
  playlist_count: number
  created_at_unix: number
}

export interface UpdateProgress {
  stage: 'idle' | 'backup' | 'downloading' | 'verifying' | 'extracting' | 'installing' | 'done' | 'error'
  message: string
  percent: number
}

export interface UpdateInstallResult {
  installed_version: string
  installed_path: string
  backup_path: string | null
  backup_files: number
}

export interface NativeRadioInfo {
  kind: 'online' | 'offline'
  id: string
  name: string
  subtitle: string
  url?: string | null
  freq_mhz?: number | null
  state: 'connecting' | 'playing' | 'disconnected'
  error?: string | null
}

export interface NativeRadioPollStatus {
  active: NativeRadioInfo | null
  step_delta: number
}

export interface PersistedAppSettings {
  revision: number
  appearance: Record<string, unknown>
  eq: Record<string, unknown>
  sort_pref: { field?: string; dir?: string }
  last_played_ids: string[]
  auto_check_updates: boolean
  skipped_update_version: string | null
}

export interface UiCommand {
  page?: string
  playlist_slug?: string
  overlay?: string
  search_query?: string
  customize_section?: string
}

export interface SyncPollResponse {
  settings_rev: number
  library_rev: number
  radio_store_rev: number
  ui_commands: UiCommand[]
}

type IpcRequest =
  | { op: 'ping' }
  | { op: 'rescan' }
  | { op: 'get_status' }
  | { op: 'list_songs'; folder?: string | null; limit?: number; offset?: number }
  | { op: 'search_songs'; query: string; limit?: number }
  | { op: 'list_folders' }
  | { op: 'list_sources' }
  | { op: 'add_source'; path: string }
  | { op: 'remove_source'; path: string }
  | { op: 'list_playlists' }
  | { op: 'get_playlist'; name: string }
  | { op: 'create_playlist'; name: string; track_ids: string[] }
  | { op: 'delete_playlist'; name: string }
  | { op: 'add_to_playlist'; name: string; track_ids: string[] }
  | { op: 'remove_from_playlist'; name: string; track_id: string }
  | { op: 'delete_song'; track_id: string }
  | {
      op: 'play'
      track_id?: string | null
      query?: string | null
      folder?: string | null
      playlist?: string | null
    }
  | { op: 'pause' }
  | { op: 'resume' }
  | { op: 'toggle_pause' }
  | { op: 'stop' }
  | { op: 'next' }
  | { op: 'previous' }
  | { op: 'seek'; position_secs: number }
  | { op: 'set_volume'; volume: number }
  | {
      op: 'set_eq'
      enabled: boolean
      preamp: number
      limiter: boolean
      bands: number[]
    }
  | { op: 'set_transition'; crossfade_secs: number }
  | {
      op: 'set_queue'
      track_ids: string[]
      start_id?: string | null
      label?: string | null
      shuffle?: boolean | null
    }
  | { op: 'jump_queue'; index: number }
  | { op: 'set_mode'; shuffle?: boolean | null; repeat?: RepeatMode | null }
  | { op: 'queue_get' }
  | { op: 'queue_add'; track_ids: string[]; play_next: boolean }
  | { op: 'queue_clear' }
  | { op: 'get_settings' }
  | { op: 'update_settings'; patch: Record<string, unknown> }
  | { op: 'reset_settings'; scope?: string | null }
  | { op: 'clear_last_played' }

type IpcResponse<T = unknown> =
  | { status: 'ok'; data: { type: string; value: T } }
  | { status: 'err'; message: string }

interface TauriInternals {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

export interface ZunoAndroidBridge {
  getInsetsJson?: () => string
  setSystemBarsLight?: (isLight: boolean) => void
  openExternalUrl?: (url: string) => boolean
  fetchUrlAsync?: (reqId: string, url: string) => void
  downloadAndInstallApk?: (
    url: string,
    expectedSha256: string,
    expectedSize: number,
    version: string,
  ) => void
  reopenPendingApkInstaller?: () => boolean
  updateMediaNotification?: (jsonPayload: string) => void
  clearMediaNotification?: () => void
}

interface AndroidUpdateProgressPayload {
  stage: UpdateProgress['stage']
  message: string
  percent: number
  apkPath?: string
}

const ZUNO_REPO = 'aswin402/zuno'

function getTauriInternals(): TauriInternals | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __TAURI_INTERNALS__?: TauriInternals }
  return w.__TAURI_INTERNALS__ ?? null
}

/** Native Android Kotlin bridge injected by MainActivity.kt (`window.__ZUNO_ANDROID__`). */
export function getAndroidBridge(): ZunoAndroidBridge | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __ZUNO_ANDROID__?: ZunoAndroidBridge }
  return w.__ZUNO_ANDROID__ ?? null
}

/** True when the Android APK exposes native in-app download + FileProvider installer bridge. */
export function hasAndroidApkInstaller(): boolean {
  const bridge = getAndroidBridge()
  return typeof bridge?.downloadAndInstallApk === 'function'
}

/** Open an external http(s) URL in the OS browser (uses Android Intent on mobile). */
export function openExternalUrl(url: string): void {
  const trimmed = url.trim()
  if (!trimmed) return
  const bridge = getAndroidBridge()
  if (bridge?.openExternalUrl) {
    try {
      if (bridge.openExternalUrl(trimmed)) return
    } catch {
      /* fall back to window.open */
    }
  }
  window.open(trimmed, '_blank', 'noopener,noreferrer')
}

interface ParsedSemver {
  major: number
  minor: number
  patch: number
  pre: string[]
}

function parseSemver(raw: string): ParsedSemver | null {
  const trimmed = raw.trim().replace(/^[vV]/, '')
  const noBuild = trimmed.split('+')[0]
  if (!noBuild) return null
  const dashIdx = noBuild.indexOf('-')
  const core = dashIdx >= 0 ? noBuild.slice(0, dashIdx) : noBuild
  const preStr = dashIdx >= 0 ? noBuild.slice(dashIdx + 1) : ''
  const parts = core.split('.')
  if (parts.length === 0 || parts.length > 3) return null
  const major = Number(parts[0])
  const minor = Number(parts[1] ?? '0')
  const patch = Number(parts[2] ?? '0')
  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    !Number.isInteger(patch) ||
    major < 0 ||
    minor < 0 ||
    patch < 0
  ) {
    return null
  }
  return {
    major,
    minor,
    patch,
    pre: preStr ? preStr.split('.') : [],
  }
}

export function isNewerSemver(current: string, latest: string): boolean {
  const c = parseSemver(current)
  const l = parseSemver(latest)
  if (!c || !l) return false
  if (l.major !== c.major) return l.major > c.major
  if (l.minor !== c.minor) return l.minor > c.minor
  if (l.patch !== c.patch) return l.patch > c.patch
  if (c.pre.length === 0 && l.pre.length === 0) return false
  if (l.pre.length === 0) return true
  if (c.pre.length === 0) return false
  const len = Math.min(c.pre.length, l.pre.length)
  for (let i = 0; i < len; i++) {
    const a = c.pre[i]
    const b = l.pre[i]
    const na = /^\d+$/.test(a) ? Number(a) : null
    const nb = /^\d+$/.test(b) ? Number(b) : null
    if (na !== null && nb !== null && na !== nb) return nb > na
    if (na !== null && nb === null) return true
    if (na === null && nb !== null) return false
    if (a !== b) return b > a
  }
  return l.pre.length > c.pre.length
}

const pendingAndroidFetches = new Map<
  string,
  { resolve: (text: string) => void; reject: (err: Error) => void; timer: number }
>()
let androidFetchSeq = 0

function androidFetchText(url: string, timeoutMs = 15000): Promise<string> {
  const bridge = getAndroidBridge()
  if (!bridge?.fetchUrlAsync) {
    return Promise.reject(new Error('Native Android network bridge unavailable'))
  }
  const w = window as unknown as {
    __zunoAndroidFetchCb?: (reqId: string, ok: boolean, payload: string) => void
  }
  if (!w.__zunoAndroidFetchCb) {
    w.__zunoAndroidFetchCb = (reqId: string, ok: boolean, payload: string) => {
      const entry = pendingAndroidFetches.get(reqId)
      if (!entry) return
      pendingAndroidFetches.delete(reqId)
      window.clearTimeout(entry.timer)
      if (ok) {
        entry.resolve(payload)
      } else {
        entry.reject(new Error(payload || 'Network request failed'))
      }
    }
  }
  const reqId = `zfetch_${++androidFetchSeq}_${Date.now()}`
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingAndroidFetches.delete(reqId)
      reject(new Error('Update check timed out'))
    }, timeoutMs)
    pendingAndroidFetches.set(reqId, { resolve, reject, timer })
    try {
      bridge.fetchUrlAsync!(reqId, url)
    } catch (err) {
      pendingAndroidFetches.delete(reqId)
      window.clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

async function checkAndroidUpdate(currentVersion: string): Promise<UpdateInfo> {
  const target = 'android-arm64'
  const canInstall = hasAndroidApkInstaller()
  const manifestUrl = `https://github.com/${ZUNO_REPO}/releases/latest/download/latest.json`
  const apiUrl = `https://api.github.com/repos/${ZUNO_REPO}/releases/latest`

  // 1. Prefer Zuno's lightweight `latest.json` via native Android HttpURLConnection (no CORS, includes SHA-256)
  try {
    const raw = await androidFetchText(manifestUrl)
    const manifest = JSON.parse(raw) as {
      version?: string
      tag?: string
      published_at?: string
      release_url?: string
      notes?: string
      targets?: Record<string, { url?: string; sha256?: string; size?: number }>
    }
    if (manifest?.version) {
      const latestVer = manifest.version.replace(/^[vV]/, '')
      const targetInfo = manifest.targets?.[target]
      const downloadUrl =
        targetInfo?.url ??
        `https://github.com/${ZUNO_REPO}/releases/download/${manifest.tag || `v${latestVer}`}/zuno-${target}.apk`
      return {
        current_version: currentVersion,
        latest_version: latestVer,
        update_available: isNewerSemver(currentVersion, latestVer),
        tag: manifest.tag || `v${latestVer}`,
        release_url:
          manifest.release_url || `https://github.com/${ZUNO_REPO}/releases/latest`,
        published_at: manifest.published_at || '',
        notes: manifest.notes || '',
        target,
        download_url: downloadUrl,
        sha256: targetInfo?.sha256 ?? null,
        size_bytes: typeof targetInfo?.size === 'number' ? targetInfo.size : null,
        can_auto_install: canInstall && Boolean(downloadUrl),
        install_path: 'Android APK',
      }
    }
  } catch {
    /* fall through to GitHub Releases REST API */
  }

  // 2. Fallback to GitHub Releases REST API (via native Android bridge or CORS-enabled WebView fetch)
  let rawApi: string
  try {
    rawApi = await androidFetchText(apiUrl)
  } catch {
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) {
      throw new Error(`GitHub Releases returned HTTP ${res.status}`)
    }
    rawApi = await res.text()
  }

  const release = JSON.parse(rawApi) as {
    tag_name?: string
    html_url?: string
    published_at?: string
    body?: string
    assets?: { name?: string; browser_download_url?: string; size?: number }[]
  }
  const tag = release.tag_name || ''
  const latestVer = tag.replace(/^[vV]/, '')
  if (!latestVer) {
    throw new Error('Could not parse latest release version')
  }
  const expectedAsset = `zuno-${target}.apk`
  const asset = release.assets?.find((a) => a.name === expectedAsset)
  const downloadUrl =
    asset?.browser_download_url ??
    `https://github.com/${ZUNO_REPO}/releases/download/${tag}/${expectedAsset}`

  return {
    current_version: currentVersion,
    latest_version: latestVer,
    update_available: isNewerSemver(currentVersion, latestVer),
    tag,
    release_url:
      release.html_url || `https://github.com/${ZUNO_REPO}/releases/tag/${tag}`,
    published_at: release.published_at || '',
    notes: release.body || '',
    target,
    download_url: downloadUrl,
    sha256: null,
    size_bytes: typeof asset?.size === 'number' ? asset.size : null,
    can_auto_install: canInstall && Boolean(downloadUrl),
    install_path: 'Android APK',
  }
}

/** True when running inside the native Tauri v2 runtime (desktop or Android/iOS). */
export function isTauriRuntime(): boolean {
  return getTauriInternals() !== null
}

/** True on Android or iOS mobile devices (including inside the Tauri mobile WebView). */
export function isMobilePlatform(): boolean {
  if (getAndroidBridge() !== null) return true
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** True only inside the desktop Tauri window (frameless titlebar, tray, native zoom). */
export function isDesktopTauriRuntime(): boolean {
  return isTauriRuntime() && !isMobilePlatform()
}

async function callApi<T>(req: IpcRequest): Promise<T> {
  const tauri = getTauriInternals()
  if (tauri) {
    const json = await tauri.invoke<IpcResponse<T>>('zuno_ipc', { req })
    if (json.status === 'err') {
      throw new Error(json.message)
    }
    return json.data.value
  }

  const res = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as IpcResponse<T>
  if (json.status === 'err') {
    throw new Error(json.message)
  }
  return json.data.value
}

export const zunoApi = {
  async getInfo(): Promise<ServerInfo> {
    const tauri = getTauriInternals()
    if (tauri) {
      return await tauri.invoke<ServerInfo>('zuno_info')
    }
    const res = await fetch('/api/info')
    if (!res.ok) throw new Error('Unable to reach Zuno backend')
    return (await res.json()) as ServerInfo
  },

  rescan: () => callApi<string>({ op: 'rescan' }),
  getStatus: () => callApi<PlaybackStatus>({ op: 'get_status' }),

  listSongs: (folder?: string | null) =>
    callApi<{ total: number; tracks: Track[] }>({
      op: 'list_songs',
      folder: folder ?? null,
      limit: 25000,
      offset: 0,
    }),

  searchSongs: (query: string) =>
    callApi<{ total: number; tracks: Track[] }>({
      op: 'search_songs',
      query,
      limit: 100,
    }),

  listFolders: () => callApi<FolderSummary[]>({ op: 'list_folders' }),
  listSources: () => callApi<MusicSource[]>({ op: 'list_sources' }),
  addSource: (path: string) => callApi<MusicSource[]>({ op: 'add_source', path }),
  removeSource: (path: string) => callApi<MusicSource[]>({ op: 'remove_source', path }),
  async pickMusicFolder(): Promise<string | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    try {
      return await tauri.invoke<string | null>('pick_music_folder')
    } catch {
      return null
    }
  },
  listPlaylists: () => callApi<Playlist[]>({ op: 'list_playlists' }),

  getPlaylist: (name: string) =>
    callApi<{ playlist: Playlist; tracks: Track[] }>({ op: 'get_playlist', name }),

  createPlaylist: (name: string, track_ids: string[] = []) =>
    callApi<{ playlist: Playlist; tracks: Track[] }>({
      op: 'create_playlist',
      name,
      track_ids,
    }),

  deletePlaylist: (name: string) => callApi<string>({ op: 'delete_playlist', name }),

  addToPlaylist: (name: string, track_ids: string[]) =>
    callApi<{ playlist: Playlist; tracks: Track[] }>({
      op: 'add_to_playlist',
      name,
      track_ids,
    }),

  removeFromPlaylist: (name: string, track_id: string) =>
    callApi<{ playlist: Playlist; tracks: Track[] }>({
      op: 'remove_from_playlist',
      name,
      track_id,
    }),

  deleteSong: (track_id: string) =>
    callApi<string>({
      op: 'delete_song',
      track_id,
    }),

  play: (opts: {
    track_id?: string | null
    query?: string | null
    folder?: string | null
    playlist?: string | null
  }) =>
    callApi<PlaybackStatus>({
      op: 'play',
      track_id: opts.track_id ?? null,
      query: opts.query ?? null,
      folder: opts.folder ?? null,
      playlist: opts.playlist ?? null,
    }),

  pause: () => callApi<PlaybackStatus>({ op: 'pause' }),
  resume: () => callApi<PlaybackStatus>({ op: 'resume' }),
  togglePause: () => callApi<PlaybackStatus>({ op: 'toggle_pause' }),
  stop: () => callApi<PlaybackStatus>({ op: 'stop' }),
  next: () => callApi<PlaybackStatus>({ op: 'next' }),
  previous: () => callApi<PlaybackStatus>({ op: 'previous' }),
  seek: (position_secs: number) =>
    callApi<PlaybackStatus>({ op: 'seek', position_secs }),
  setVolume: (volume: number) => callApi<PlaybackStatus>({ op: 'set_volume', volume }),
  setEq: (opts: {
    enabled: boolean
    preamp: number
    limiter: boolean
    bands: number[]
  }) => callApi<string>({ op: 'set_eq', ...opts }),
  setTransition: (crossfade_secs: number) =>
    callApi<string>({ op: 'set_transition', crossfade_secs }),
  setQueue: (opts: {
    track_ids: string[]
    start_id?: string | null
    label?: string | null
    shuffle?: boolean | null
  }) =>
    callApi<PlaybackStatus>({
      op: 'set_queue',
      track_ids: opts.track_ids,
      start_id: opts.start_id ?? null,
      label: opts.label ?? null,
      shuffle: opts.shuffle ?? null,
    }),
  jumpQueue: (index: number) => callApi<PlaybackStatus>({ op: 'jump_queue', index }),
  setMode: (opts: { shuffle?: boolean | null; repeat?: RepeatMode | null }) =>
    callApi<PlaybackStatus>({
      op: 'set_mode',
      shuffle: opts.shuffle ?? null,
      repeat: opts.repeat ?? null,
    }),

  queueGet: () =>
    callApi<{ current_index: number | null; tracks: Track[] }>({ op: 'queue_get' }),

  queueAdd: (track_ids: string[], play_next = false) =>
    callApi<{ current_index: number | null; tracks: Track[] }>({
      op: 'queue_add',
      track_ids,
      play_next,
    }),

  queueClear: () => callApi<PlaybackStatus>({ op: 'queue_clear' }),

  async audioLevels(): Promise<AudioLevels | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    try {
      return await tauri.invoke<AudioLevels>('zuno_audio_levels')
    } catch {
      return null
    }
  },

  async checkUpdate(currentVersionHint?: string): Promise<UpdateInfo | null> {
    if (isMobilePlatform()) {
      const currentVer =
        currentVersionHint ||
        (typeof __ZUNO_VERSION__ === 'string' ? __ZUNO_VERSION__ : '0.0.0')
      return await checkAndroidUpdate(currentVer)
    }
    const tauri = getTauriInternals()
    if (!tauri) return null
    return await tauri.invoke<UpdateInfo>('zuno_check_update')
  },

  async installAndroidApk(opts: {
    downloadUrl: string
    sha256?: string | null
    sizeBytes?: number | null
    targetVersion: string
    createBackup: boolean
    uiSettingsJson?: string
    onProgress?: (progress: UpdateProgress) => void
  }): Promise<UpdateInstallResult> {
    const bridge = getAndroidBridge()
    if (!bridge?.downloadAndInstallApk) {
      throw new Error(
        'In-app APK installer is unavailable in this build. Tap Download APK to upgrade via browser.',
      )
    }

    let backupPath: string | null = null
    let backupFiles = 0
    if (opts.createBackup) {
      opts.onProgress?.({
        stage: 'backup',
        message: 'Backing up playlists, folders, EQ & settings…',
        percent: 10,
      })
      try {
        const report = await this.backupData(opts.uiSettingsJson)
        if (report) {
          backupPath = report.backup_path
          backupFiles = report.files_count
        }
      } catch {
        /* non-fatal on mobile — proceed with APK download */
      }
    }

    const w = window as unknown as {
      __zunoAndroidUpdateProgress?: (payload: AndroidUpdateProgressPayload) => void
    }

    return await new Promise<UpdateInstallResult>((resolve, reject) => {
      const prevHandler = w.__zunoAndroidUpdateProgress
      const cleanup = () => {
        if (w.__zunoAndroidUpdateProgress === handler) {
          w.__zunoAndroidUpdateProgress = prevHandler
        }
      }
      const handler = (payload: AndroidUpdateProgressPayload) => {
        opts.onProgress?.({
          stage: payload.stage,
          message: payload.message,
          percent: payload.percent,
        })
        if (payload.stage === 'done') {
          cleanup()
          resolve({
            installed_version: opts.targetVersion.replace(/^[vV]/, ''),
            installed_path: payload.apkPath || 'Android APK',
            backup_path: backupPath,
            backup_files: backupFiles,
          })
        } else if (payload.stage === 'error') {
          cleanup()
          reject(new Error(payload.message || 'Failed to download APK update'))
        }
      }
      w.__zunoAndroidUpdateProgress = handler
      try {
        bridge.downloadAndInstallApk!(
          opts.downloadUrl,
          opts.sha256 ?? '',
          opts.sizeBytes ?? 0,
          opts.targetVersion,
        )
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  },

  reopenAndroidApkInstaller(): boolean {
    const bridge = getAndroidBridge()
    if (!bridge?.reopenPendingApkInstaller) return false
    try {
      return Boolean(bridge.reopenPendingApkInstaller())
    } catch {
      return false
    }
  },

  async backupData(uiSettingsJson?: string): Promise<BackupReport | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    return await tauri.invoke<BackupReport>('zuno_backup_data', {
      uiSettingsJson: uiSettingsJson ?? null,
    })
  },

  async getUpdateProgress(): Promise<UpdateProgress | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    try {
      return await tauri.invoke<UpdateProgress>('zuno_update_progress')
    } catch {
      return null
    }
  },

  async installUpdate(opts: {
    downloadUrl: string
    sha256?: string | null
    sizeBytes?: number | null
    targetVersion: string
    createBackup: boolean
    uiSettingsJson?: string
  }): Promise<UpdateInstallResult> {
    const tauri = getTauriInternals()
    if (!tauri) {
      throw new Error('Self-update is available in the native Zuno desktop app.')
    }
    return await tauri.invoke<UpdateInstallResult>('zuno_install_update', {
      downloadUrl: opts.downloadUrl,
      sha256: opts.sha256 ?? null,
      sizeBytes: opts.sizeBytes ?? null,
      targetVersion: opts.targetVersion,
      createBackup: opts.createBackup,
      uiSettingsJson: opts.uiSettingsJson ?? null,
    })
  },

  async relaunchApp(): Promise<void> {
    const tauri = getTauriInternals()
    if (!tauri) return
    await tauri.invoke('zuno_relaunch_app')
  },

  async radioLoadStore(): Promise<RadioStoreData | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    return await tauri.invoke<RadioStoreData>('zuno_radio_load_store')
  },

  async radioSaveStore(store: RadioStoreData): Promise<void> {
    const tauri = getTauriInternals()
    if (!tauri) return
    await tauri.invoke('zuno_radio_save_store', { store })
  },

  async radioDiscover(opts: {
    query?: string
    tag?: string
    country?: string
    language?: string
    limit?: number
  }): Promise<DiscoveredStation[]> {
    const tauri = getTauriInternals()
    if (!tauri) return []
    return await tauri.invoke<DiscoveredStation[]>('zuno_radio_discover', {
      query: opts.query ?? null,
      tag: opts.tag ?? null,
      country: opts.country ?? null,
      language: opts.language ?? null,
      limit: opts.limit ?? 40,
    })
  },

  async radioResolveUrl(url: string): Promise<ResolvedStreamInfo> {
    const tauri = getTauriInternals()
    if (!tauri) {
      return {
        original_url: url,
        resolved_url: url,
        name: null,
        genre: null,
        bitrate: null,
        content_type: null,
        is_hls: isHlsStreamUrl(url),
      }
    }
    return await tauri.invoke<ResolvedStreamInfo>('zuno_radio_resolve_url', { url })
  },

  async fmHardwareStatus(): Promise<FmHardwareStatus> {
    const tauri = getTauriInternals()
    if (!tauri) {
      return {
        available: false,
        backend: 'none',
        devices: [],
        rtl_fm_installed: false,
        usb_sdr_detected: false,
        v4l2_devices: [],
        active_freq_mhz: null,
        message:
          'Offline FM hardware reception requires the native Zuno desktop app with an RTL-SDR USB dongle or V4L2 FM tuner. You can still dial & mark offline FM frequencies below.',
      }
    }
    return await tauri.invoke<FmHardwareStatus>('zuno_fm_hardware_status')
  },

  async fmTune(
    freqMhz: number,
    opts?: { name?: string; signalId?: string },
  ): Promise<FmHardwareStatus> {
    const tauri = getTauriInternals()
    if (!tauri) {
      throw new Error(
        'Offline FM hardware reception requires the native Zuno desktop app with an RTL-SDR USB dongle or V4L2 FM tuner.',
      )
    }
    return await tauri.invoke<FmHardwareStatus>('zuno_fm_tune', {
      freqMhz,
      name: opts?.name ?? null,
      signalId: opts?.signalId ?? null,
    })
  },

  async fmStop(): Promise<FmHardwareStatus | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    return await tauri.invoke<FmHardwareStatus>('zuno_fm_stop')
  },

  async radioPlayOnline(opts: {
    id: string
    name: string
    subtitle: string
    url: string
  }): Promise<NativeRadioInfo> {
    const tauri = getTauriInternals()
    if (!tauri) {
      throw new Error('NO_NATIVE_STREAM_DECODER')
    }
    return await tauri.invoke<NativeRadioInfo>('zuno_radio_play_online', {
      id: opts.id,
      name: opts.name,
      subtitle: opts.subtitle,
      url: opts.url,
    })
  },

  async radioDisconnect(): Promise<NativeRadioInfo | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    return await tauri.invoke<NativeRadioInfo | null>('zuno_radio_disconnect')
  },

  async radioStop(): Promise<void> {
    const tauri = getTauriInternals()
    if (!tauri) return
    await tauri.invoke('zuno_radio_stop')
  },

  async radioPoll(): Promise<NativeRadioPollStatus | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    try {
      return await tauri.invoke<NativeRadioPollStatus>('zuno_radio_poll')
    } catch {
      return null
    }
  },

  async syncPoll(): Promise<SyncPollResponse | null> {
    const tauri = getTauriInternals()
    if (!tauri) return null
    try {
      return await tauri.invoke<SyncPollResponse>('zuno_sync_poll')
    } catch {
      return null
    }
  },

  getSettings: () =>
    callApi<{ settings: PersistedAppSettings; options?: Record<string, unknown> }>({
      op: 'get_settings',
    }),

  updateSettings: (patch: Record<string, unknown>) =>
    callApi<{ settings: PersistedAppSettings }>({
      op: 'update_settings',
      patch,
    }),

  resetSettings: (scope?: 'appearance' | 'all') =>
    callApi<{ settings: PersistedAppSettings }>({
      op: 'reset_settings',
      scope: scope ?? 'appearance',
    }),

  clearLastPlayed: () => callApi<string>({ op: 'clear_last_played' }),

  audioUrl: (trackId: string) => `/api/audio/${encodeURIComponent(trackId)}`,
  coverUrl: (trackId: string, size?: number) => {
    const q = size ? `?s=${size}` : ''
    if (!isTauriRuntime()) {
      return `/api/cover/${encodeURIComponent(trackId)}${q}`
    }
    const proto = typeof window !== 'undefined' ? window.location.protocol : ''
    const base =
      proto === 'https:'
        ? 'https://zuno.localhost'
        : proto === 'http:'
          ? 'http://zuno.localhost'
          : 'zuno://localhost'
    return `${base}/cover/${encodeURIComponent(trackId)}${q}`
  },

  async mcpRpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const res = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    })
    return await res.json()
  },
}

export type WindowResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Native Tauri v2 window chrome controls (zero extra npm dependencies). */
export const zunoWindow = {
  minimize: async () => {
    const tauri = getTauriInternals()
    if (tauri) await tauri.invoke('window_minimize').catch(() => {})
  },
  toggleMaximize: async (): Promise<boolean> => {
    const tauri = getTauriInternals()
    if (!tauri) return false
    try {
      return await tauri.invoke<boolean>('window_toggle_maximize')
    } catch {
      return false
    }
  },
  isMaximized: async (): Promise<boolean> => {
    const tauri = getTauriInternals()
    if (!tauri) return false
    try {
      return await tauri.invoke<boolean>('window_is_maximized')
    } catch {
      return false
    }
  },
  close: async () => {
    const tauri = getTauriInternals()
    if (tauri) await tauri.invoke('window_close').catch(() => {})
  },
  toggleFullscreen: async (): Promise<boolean> => {
    const tauri = getTauriInternals()
    if (!tauri) return false
    try {
      return await tauri.invoke<boolean>('window_toggle_fullscreen')
    } catch {
      return false
    }
  },
  setZoom: async (percent: number): Promise<void> => {
    const clamped = clampUiZoom(percent)
    const factor = clamped / 100
    const tauri = getTauriInternals()
    if (tauri && isDesktopTauriRuntime()) {
      if (typeof document !== 'undefined') {
        document.documentElement.style.zoom = ''
      }
      await tauri.invoke('window_set_zoom', { factor }).catch(() => {})
      return
    }
    if (typeof document !== 'undefined') {
      // Never apply CSS `zoom` on mobile WebViews — keeps viewport width locked to 100% device width
      document.documentElement.style.zoom =
        isMobilePlatform() || clamped === 100 ? '' : `${clamped}%`
    }
  },
  quit: async () => {
    const tauri = getTauriInternals()
    if (tauri) await tauri.invoke('app_quit').catch(() => {})
  },
  startDragging: async () => {
    const tauri = getTauriInternals()
    if (tauri) await tauri.invoke('window_start_dragging').catch(() => {})
  },
  startResizeDragging: async (direction: WindowResizeDir) => {
    const tauri = getTauriInternals()
    if (!tauri) return
    const map: Record<WindowResizeDir, string> = {
      n: 'North',
      s: 'South',
      e: 'East',
      w: 'West',
      ne: 'NorthEast',
      nw: 'NorthWest',
      se: 'SouthEast',
      sw: 'SouthWest',
    }
    await tauri
      .invoke('plugin:window|start_resize_dragging', {
        label: 'main',
        value: map[direction],
      })
      .catch(() => {})
  },
}
