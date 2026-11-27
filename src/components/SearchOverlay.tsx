import { useEffect, useMemo, useState } from 'react'
import { Search } from '@/components/Search'
import { ArtworkTile } from '@/components/ArtworkTile'
import { ZunoIcon } from '@/components/ZunoIcon'
import { displayArtist, prefersReducedMotion } from '@/lib/format'
import { cn, formatTime } from '@/lib/utils'
import type { AppearanceSettings } from '@/lib/appearance'
import type { Track } from '@/lib/zunoApi'

interface SearchOverlayProps {
  open: boolean
  query: string
  results: Track[]
  currentTrackId: string | null
  isPlaying: boolean
  appearance: AppearanceSettings
  onQueryChange: (q: string) => void
  onSelectTrack: (track: Track, pool: Track[]) => void
  onClose: () => void
}

/**
 * Floating Search overlay (used on both Desktop and Mobile — replaces the dedicated Search page).
 * Opens Bencho's spring Search pill at the top with a live matching results card directly beneath.
 */
export function SearchOverlay({
  open,
  query,
  results,
  currentTrackId,
  isPlaying,
  appearance,
  onQueryChange,
  onSelectTrack,
  onClose,
}: SearchOverlayProps) {
  const [mounted, setMounted] = useState(open)
  const [phase, setPhase] = useState<'enter' | 'open' | 'closing'>(
    open ? 'open' : 'enter',
  )
  const [highlightIdx, setHighlightIdx] = useState(0)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setPhase('enter')
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setPhase('open'))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    if (!mounted) return
    setPhase('closing')
    const timer = window.setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : 165)
    return () => window.clearTimeout(timer)
  }, [open, mounted])

  const trimmed = query.trim().toLowerCase()

  const displayed = useMemo(() => {
    if (!trimmed) return results.slice(0, 8)
    // Instant local match layered over backend results for zero-latency feel
    const filtered = results.filter(
      (t) =>
        t.title.toLowerCase().includes(trimmed) ||
        t.artist.toLowerCase().includes(trimmed) ||
        t.album.toLowerCase().includes(trimmed) ||
        t.folder.toLowerCase().includes(trimmed),
    )
    return (filtered.length > 0 ? filtered : results).slice(0, 10)
  }, [results, trimmed])

  useEffect(() => {
    setHighlightIdx(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  const fieldWidth =
    typeof window !== 'undefined' && window.innerWidth < 520
      ? Math.min(340, window.innerWidth - 56)
      : 400

  return (
    <div
      onClick={onClose}
      className={cn(
        't-modal-backdrop fixed inset-0 z-50 flex flex-col items-center bg-black/55 px-4 pt-[max(11vh,calc(var(--zuno-safe-top)+1.25rem))] backdrop-blur-sm',
        phase === 'open' && 'is-open',
        phase === 'closing' && 'is-closing pointer-events-none',
      )}
      data-stroke="on"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          't-modal flex w-full max-w-[440px] flex-col items-center',
          phase === 'open' && 'is-open',
          phase === 'closing' && 'is-closing',
        )}
      >
        {/* Bencho Search morphing circle -> pill */}
        <Search
          value={query}
          onValueChange={onQueryChange}
          placeholder="Search songs, artists, folders..."
          width={fieldWidth}
          spring={35}
          autoOpen
          allowTouchKeyboard
          keepOpenOnBlur
          onEscape={onClose}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlightIdx((i) =>
                displayed.length > 0 ? (i + 1) % displayed.length : 0,
              )
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightIdx((i) =>
                displayed.length > 0
                  ? (i - 1 + displayed.length) % displayed.length
                  : 0,
              )
            } else if (e.key === 'Enter' && displayed[highlightIdx]) {
              e.preventDefault()
              onSelectTrack(displayed[highlightIdx], displayed)
              onClose()
            }
          }}
        />

        {/* Relevant results card directly underneath */}
        <div className="mt-2 w-full overflow-hidden rounded-3xl border border-border bg-card/95 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {trimmed ? `Results · ${displayed.length}` : 'Quick Play'}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              Enter to play · Esc to close
            </span>
          </div>

          {displayed.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No songs matching "{query}"
            </div>
          ) : (
            <div className="max-h-[48vh] overflow-y-auto p-1.5">
              {displayed.map((track, idx) => {
                const active = track.id === currentTrackId
                const highlighted = idx === highlightIdx
                const subtitle = displayArtist(track)
                return (
                  <button
                    key={track.id}
                    type="button"
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => {
                      onSelectTrack(track, displayed)
                      onClose()
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors cursor-pointer',
                      highlighted ? 'bg-secondary' : 'hover:bg-secondary/60',
                    )}
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                      <ArtworkTile
                        trackId={track.id}
                        hasCover={track.has_cover}
                        seed={track.title}
                        variant="thumb"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-[13px] font-medium',
                          active ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {track.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {subtitle}
                      </p>
                    </div>

                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                      {formatTime(track.duration_secs)}
                    </span>

                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : highlighted
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground',
                      )}
                    >
                      <ZunoIcon
                        name={active && isPlaying ? 'pause' : 'play'}
                        pack={appearance.iconPack}
                        filled
                        className="h-3 w-3 translate-x-[0.5px]"
                      />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
