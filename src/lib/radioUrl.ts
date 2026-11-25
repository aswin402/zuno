const STREAM_EXT_SET = new Set(['mp3', 'aac', 'ogg', 'opus', 'flac', 'm4a', 'wav', 'm3u8', 'm3u', 'pls'])
const PLAYLIST_EXT_SET = new Set(['pls', 'm3u'])

const CONTENT_TYPE_CODEC_RULES: ReadonlyArray<readonly [string, string]> = [
  ['mpegurl', 'HLS'],
  ['aac', 'AAC'],
  ['ogg', 'OGG'],
  ['opus', 'OPUS'],
  ['flac', 'FLAC'],
  ['mpeg', 'MP3'],
  ['mp3', 'MP3'],
]

/** Parse an HTTP(S) radio stream URL using the standard WHATWG `URL` parser (supports localhost & IPv6). */
export function parseHttpStreamUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 2048) return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname) return null
    return u
  } catch {
    return null
  }
}

export function isValidHttpStreamUrl(raw: string): boolean {
  return parseHttpStreamUrl(raw) !== null
}

function pathnameExtension(raw: string): string {
  const u = parseHttpStreamUrl(raw)
  if (!u) return ''
  const lastSeg = u.pathname.split('/').filter(Boolean).pop() ?? ''
  const dot = lastSeg.lastIndexOf('.')
  return dot > 0 ? lastSeg.slice(dot + 1).toLowerCase() : ''
}

export function isHlsStreamUrl(raw: string): boolean {
  return pathnameExtension(raw) === 'm3u8'
}

export function isPlaylistStreamUrl(raw: string): boolean {
  return PLAYLIST_EXT_SET.has(pathnameExtension(raw))
}

export function inferCodecFromContentType(contentType: string | null | undefined, isHls = false): string | null {
  if (isHls) return 'HLS'
  if (!contentType) return null
  const low = contentType.toLowerCase()
  for (const [needle, codec] of CONTENT_TYPE_CODEC_RULES) {
    if (low.includes(needle)) return codec
  }
  return null
}

export function deriveStationNameFromUrl(raw: string): string {
  const u = parseHttpStreamUrl(raw)
  if (!u) return 'Custom Radio Stream'
  const host = u.hostname.startsWith('www.') ? u.hostname.slice(4) : u.hostname
  const lastSeg = u.pathname.split('/').filter(Boolean).pop()
  if (!lastSeg) return host
  const dot = lastSeg.lastIndexOf('.')
  const ext = dot > 0 ? lastSeg.slice(dot + 1).toLowerCase() : ''
  const stem = STREAM_EXT_SET.has(ext) ? lastSeg.slice(0, dot) : lastSeg
  return stem ? `${host} · ${stem}` : host
}
