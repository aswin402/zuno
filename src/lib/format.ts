import type { DensityId } from '@/lib/appearance'
import type { Playlist, Track } from '@/lib/zunoApi'

export const DEFAULT_VOLUME = 0.8
export const MUTE_EPSILON = 0.001
export const UNKNOWN_ARTIST = 'Unknown Artist'
export const DEFAULT_FM_FREQ_MHZ = 98.3
export const FM_MATCH_EPSILON = 0.051
export const LAST_PLAYED_MAX = 30

/** Clean user-facing error message without fragile repeated prefix-stripping regexes. */
export function formatError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim()
  }
  const raw = String(err ?? '').trim()
  const cleaned =
    raw.slice(0, 6).toLowerCase() === 'error:' ? raw.slice(6).trim() : raw
  return cleaned || fallback
}

/**
 * Shorten a filesystem path by replacing the active OS home prefix with `~`.
 * Works across Linux (`/home/...`, `/var/home/...`), macOS (`/Users/...`), and Windows (`C:\Users\...`).
 */
export function shortenHomePath(path: string, homeDir?: string | null): string {
  if (!path) return path
  if (homeDir) {
    const cleanHome = homeDir.replace(/[\\/]+$/, '')
    if (cleanHome && (path === cleanHome || path.startsWith(`${cleanHome}/`) || path.startsWith(`${cleanHome}\\`))) {
      return `~${path.slice(cleanHome.length)}`
    }
  }
  // Cross-platform structural fallback when `homeDir` is unavailable (e.g. web preview)
  const sep = path.includes('\\') ? '\\' : '/'
  const parts = path.split(sep)
  if (sep === '/' && (parts[1] === 'home' || parts[1] === 'Users') && parts[2]) {
    return ['~', ...parts.slice(3)].join('/')
  }
  if (sep === '\\' && parts[0]?.endsWith(':') && parts[1]?.toLowerCase() === 'users' && parts[2]) {
    return ['~', ...parts.slice(3)].join('\\')
  }
  return path
}

/** Single canonical artist display helper replacing 8 repeated `'Unknown Artist'` checks. */
export function displayArtist(track: Pick<Track, 'artist' | 'folder'> | null | undefined): string {
  if (!track) return ''
  if (track.artist && track.artist !== UNKNOWN_ARTIST) return track.artist
  return track.folder || UNKNOWN_ARTIST
}

/** Single canonical Favorites playlist detector replacing 5 duplicated slug checks. */
export function isFavoritesPlaylist(pl: Pick<Playlist, 'slug'>): boolean {
  const s = pl.slug.toLowerCase()
  return s === 'favorites' || s === 'fav'
}

const ROW_HEIGHT_BY_DENSITY: Record<DensityId, number> = {
  compact: 50,
  comfortable: 60,
  spacious: 68,
}

export function estimateTrackRowHeight(density: DensityId, showOverline: boolean): number {
  return ROW_HEIGHT_BY_DENSITY[density] - (showOverline ? 0 : 8)
}

/** Deterministic 32-bit FNV-1a string hash (shared across ArtworkTile, Scrubber, CustomFonts). */
export function fnv1aHash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Single shared reduced-motion check replacing 6 duplicated helpers. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  )
}

/** Quantize FM MHz to integer tenths (`98.3` -> `983`) for exact O(1) Map lookup without float epsilons. */
export function freqToDeciMhz(freqMhz: number): number {
  return Math.round(freqMhz * 10)
}
