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
  suggested_dirs?: string[]
  mcp_http_url: string
  version: string
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

type IpcResponse<T = unknown> =
  | { status: 'ok'; data: { type: string; value: T } }
  | { status: 'err'; message: string }

interface TauriInternals {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

function getTauriInternals(): TauriInternals | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __TAURI_INTERNALS__?: TauriInternals }
  return w.__TAURI_INTERNALS__ ?? null
}

/** True when running inside the native Tauri v2 desktop window (direct Rust IPC + Rodio audio). */
export function isTauriRuntime(): boolean {
  return getTauriInternals() !== null
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

  audioUrl: (trackId: string) => `/api/audio/${encodeURIComponent(trackId)}`,
  coverUrl: (trackId: string, size?: number) => {
    const q = size ? `?s=${size}` : ''
    return isTauriRuntime()
      ? `zuno://localhost/cover/${encodeURIComponent(trackId)}${q}`
      : `/api/cover/${encodeURIComponent(trackId)}${q}`
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
