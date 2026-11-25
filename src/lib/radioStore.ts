import {
  CURATED_ONLINE_STATIONS,
  FM_BANDS,
  type FmBandId,
  type OnlineStation,
} from '@/lib/radioStations'
import { isTauriRuntime, zunoApi } from '@/lib/zunoApi'

export interface OfflineSignalStation {
  id: string
  freq_mhz: number
  name: string
  region: string
  genre: string
  notes: string
  band: FmBandId
  marked: boolean
  created_at: number
}

export interface RadioStoreData {
  marked_online_ids: string[]
  custom_online: Array<{
    id: string
    name: string
    url: string
    category: string
    country: string
    language: string
    tags: string[]
    bitrate: number
    codec: string
    homepage: string
    added_at: number
  }>
  offline_signals: OfflineSignalStation[]
  last_freq_mhz: number
  band: FmBandId
}

export interface DiscoveredStation {
  id: string
  name: string
  url: string
  country: string
  language: string
  tags: string[]
  bitrate: number
  codec: string
  homepage: string
  votes: number
}

export interface ResolvedStreamInfo {
  original_url: string
  resolved_url: string
  name: string | null
  genre: string | null
  bitrate: number | null
  content_type: string | null
  is_hls: boolean
}

export interface FmHardwareStatus {
  available: boolean
  backend: 'rtl_fm' | 'v4l2' | 'none' | string
  devices: string[]
  rtl_fm_installed: boolean
  usb_sdr_detected: boolean
  v4l2_devices: string[]
  active_freq_mhz: number | null
  message: string
}

export interface ActiveRadioPlayback {
  kind: 'online' | 'offline'
  id: string
  name: string
  subtitle: string
  url?: string
  freqMhz?: number
  isPlaying: boolean
  isBuffering: boolean
  error: string | null
}

const LOCAL_STORAGE_KEY = 'zuno:radio_store'

export const DEFAULT_RADIO_STORE: RadioStoreData = {
  marked_online_ids: [],
  custom_online: [],
  offline_signals: [],
  last_freq_mhz: 98.3,
  band: 'global',
}

function normalizeBand(raw: unknown): FmBandId {
  return raw === 'americas' || raw === 'japan' ? raw : 'global'
}

function normalizeStore(raw: Partial<RadioStoreData> | null | undefined): RadioStoreData {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RADIO_STORE }
  const band = normalizeBand(raw.band)
  const spec = FM_BANDS[band]
  const rawFreq = typeof raw.last_freq_mhz === 'number' && Number.isFinite(raw.last_freq_mhz)
    ? raw.last_freq_mhz
    : 98.3
  const clampedFreq = Math.round(Math.min(spec.maxMhz, Math.max(spec.minMhz, rawFreq)) * 10) / 10
  return {
    marked_online_ids: Array.isArray(raw.marked_online_ids)
      ? raw.marked_online_ids.filter((x): x is string => typeof x === 'string')
      : [],
    custom_online: Array.isArray(raw.custom_online) ? raw.custom_online : [],
    offline_signals: Array.isArray(raw.offline_signals)
      ? raw.offline_signals.map((s) => ({
          ...s,
          band: normalizeBand(s.band),
          freq_mhz: Math.round(Number(s.freq_mhz || 98.3) * 10) / 10,
          marked: s.marked !== false,
        }))
      : [],
    last_freq_mhz: clampedFreq,
    band,
  }
}

export async function loadRadioStore(): Promise<RadioStoreData> {
  if (isTauriRuntime()) {
    try {
      const native = await zunoApi.radioLoadStore()
      if (native) return normalizeStore(native)
    } catch {
      /* fall back to localStorage */
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw) return normalizeStore(JSON.parse(raw) as Partial<RadioStoreData>)
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_RADIO_STORE }
}

export async function saveRadioStore(store: RadioStoreData): Promise<void> {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
  if (isTauriRuntime()) {
    await zunoApi.radioSaveStore(store).catch(() => {})
  }
}

export function mergeOnlineStations(store: RadioStoreData): OnlineStation[] {
  const custom: OnlineStation[] = store.custom_online.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    category: 'Custom',
    country: c.country || 'Custom Link',
    language: c.language || '',
    tags: c.tags ?? [],
    bitrate: c.bitrate || 0,
    codec: c.codec || 'STREAM',
    homepage: c.homepage || undefined,
    isCustom: true,
    addedAt: c.added_at,
  }))
  return [...custom, ...CURATED_ONLINE_STATIONS]
}

export function formatMhz(freq: number): string {
  return `${freq.toFixed(1)} MHz`
}

export function clampFreqToBand(freq: number, band: FmBandId): number {
  const spec = FM_BANDS[band]
  const snapped =
    spec.minMhz + Math.round((freq - spec.minMhz) / spec.stepMhz) * spec.stepMhz
  const clamped = Math.min(spec.maxMhz, Math.max(spec.minMhz, snapped))
  return Math.round(clamped * 10) / 10
}

export async function discoverStations(opts: {
  query?: string
  tag?: string
  country?: string
  language?: string
  limit?: number
}): Promise<DiscoveredStation[]> {
  if (isTauriRuntime()) {
    return await zunoApi.radioDiscover(opts)
  }

  // Web browser direct fallback via open Radio Browser API
  const params = new URLSearchParams({
    hidebroken: 'true',
    order: 'votes',
    reverse: 'true',
    limit: String(opts.limit ?? 40),
  })
  if (opts.query?.trim()) params.set('name', opts.query.trim())
  if (opts.tag?.trim()) params.set('tag', opts.tag.trim())
  if (opts.country?.trim()) params.set('country', opts.country.trim())
  if (opts.language?.trim()) params.set('language', opts.language.trim())

  const mirrors = [
    'https://de1.api.radio-browser.info',
    'https://de2.api.radio-browser.info',
    'https://fi1.api.radio-browser.info',
  ]
  let lastErr = 'Unable to reach Radio Browser directory'
  for (const base of mirrors) {
    try {
      const res = await fetch(`${base}/json/stations/search?${params.toString()}`)
      if (!res.ok) continue
      const list = (await res.json()) as Array<Record<string, unknown>>
      const seen = new Set<string>()
      const out: DiscoveredStation[] = []
      for (const item of list) {
        const url = String(item.url_resolved || item.url || '').trim()
        const name = String(item.name || '').trim()
        if (!url.startsWith('http') || !name || seen.has(url) || Number(item.lastcheckok) === 0) {
          continue
        }
        seen.add(url)
        out.push({
          id: `rb-${String(item.stationuuid || out.length)}`,
          name,
          url,
          country: String(item.country || '').trim(),
          language: String(item.language || '').trim(),
          tags: String(item.tags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 5),
          bitrate: Number(item.bitrate || 0),
          codec: String(item.codec || 'MP3').toUpperCase(),
          homepage: String(item.homepage || '').trim(),
          votes: Number(item.votes || 0),
        })
      }
      return out
    } catch (e) {
      lastErr = String(e)
    }
  }
  throw new Error(lastErr)
}

export async function resolveRadioLink(rawUrl: string): Promise<ResolvedStreamInfo> {
  const trimmed = rawUrl.trim()
  if (!/^https?:\/\/\S+\.\S+/i.test(trimmed)) {
    throw new Error('Please paste a valid http:// or https:// radio stream link.')
  }
  if (isTauriRuntime()) {
    return await zunoApi.radioResolveUrl(trimmed)
  }
  return {
    original_url: trimmed,
    resolved_url: trimmed,
    name: null,
    genre: null,
    bitrate: null,
    content_type: null,
    is_hls: /\.m3u8(\?|$)/i.test(trimmed),
  }
}
