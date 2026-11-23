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

export function sortTracks(tracks: Track[], field: SortField, dir: SortDir): Track[] {
  if (field === 'default') return tracks
  const mult = dir === 'asc' ? 1 : -1

  return [...tracks].sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name':
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
        break
      case 'artist':
        cmp = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base', numeric: true })
        break
      case 'album':
        cmp = a.album.localeCompare(b.album, undefined, { sensitivity: 'base', numeric: true })
        break
      case 'time':
        cmp = a.modified_secs - b.modified_secs
        break
      case 'size':
        cmp = a.file_size - b.file_size
        break
      case 'duration':
        cmp = a.duration_secs - b.duration_secs
        break
    }
    if (cmp !== 0) return cmp * mult
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
  })
}
