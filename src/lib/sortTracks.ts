import type { Track } from '@/lib/zunoApi'

export type SortField =
  | 'default'
  | 'name'
  | 'artist'
  | 'album'
  | 'time'
  | 'size'
  | 'duration'
export type SortDir = 'asc' | 'desc'

export interface SortOption {
  field: SortField
  label: string
  defaultDir: SortDir
}

export const SORT_OPTIONS: SortOption[] = [
  { field: 'name', label: 'Name', defaultDir: 'asc' },
  { field: 'artist', label: 'Artist', defaultDir: 'asc' },
  { field: 'album', label: 'Album', defaultDir: 'asc' },
  { field: 'time', label: 'Time', defaultDir: 'desc' },
  { field: 'size', label: 'Size', defaultDir: 'desc' },
  { field: 'duration', label: 'Duration', defaultDir: 'asc' },
]

/** Reusable locale-aware natural collator (avoids O(N log N) options allocations during sort). */
const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
})

type TrackComparator = (a: Track, b: Track) => number

const COMPARATORS: Record<Exclude<SortField, 'default'>, TrackComparator> = {
  name: (a, b) => NATURAL_COLLATOR.compare(a.title, b.title),
  artist: (a, b) => NATURAL_COLLATOR.compare(a.artist, b.artist),
  album: (a, b) => NATURAL_COLLATOR.compare(a.album, b.album),
  time: (a, b) => a.modified_secs - b.modified_secs,
  size: (a, b) => a.file_size - b.file_size,
  duration: (a, b) => a.duration_secs - b.duration_secs,
}

export function sortTracks(tracks: Track[], field: SortField, dir: SortDir): Track[] {
  if (field === 'default') return tracks
  const mult = dir === 'asc' ? 1 : -1
  const primary = COMPARATORS[field]

  return [...tracks].sort((a, b) => {
    const cmp = primary(a, b)
    if (cmp !== 0) return cmp * mult
    return NATURAL_COLLATOR.compare(a.title, b.title)
  })
}
