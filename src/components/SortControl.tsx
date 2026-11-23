import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SORT_OPTIONS, type SortDir, type SortField } from '@/lib/sortTracks'

interface SortControlProps {
  field: SortField
  dir: SortDir
  allowDefault?: boolean
  onChange: (field: SortField, dir: SortDir) => void
}

export function SortControl({
  field,
  dir,
  allowDefault = false,
  onChange,
}: SortControlProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const options = allowDefault
    ? [
        {
          field: 'default' as SortField,
          label: 'Playlist order',
          defaultDir: 'asc' as SortDir,
        },
        ...SORT_OPTIONS,
      ]
    : SORT_OPTIONS

  const activeOpt = options.find((o) => o.field === field) ?? options[0]
  const canToggleDir = field !== 'default'

  function selectField(nextField: SortField, defaultDir: SortDir) {
    if (nextField === field && nextField !== 'default') {
      onChange(nextField, dir === 'asc' ? 'desc' : 'asc')
    } else if (nextField === 'default') {
      onChange(nextField, defaultDir)
    } else {
      // Preserve chosen direction when switching fields so Asc/Desc behaves predictably
      onChange(nextField, field === 'default' ? defaultDir : dir)
    }
  }

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Sort field selector */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer',
          open && 'bg-secondary text-foreground',
        )}
        title="Sort by"
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span>Sort: {activeOpt.label}</span>
      </button>

      {/* Dedicated 1-click Ascending / Descending toggle */}
      {canToggleDir && (
        <button
          type="button"
          onClick={() => onChange(field, dir === 'asc' ? 'desc' : 'asc')}
          className="flex h-8 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          title={dir === 'asc' ? 'Ascending (click for Descending)' : 'Descending (click for Ascending)'}
          aria-label={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
        >
          {dir === 'asc' ? (
            <>
              <ArrowUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Asc</span>
            </>
          ) : (
            <>
              <ArrowDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Desc</span>
            </>
          )}
        </button>
      )}

      {open && (
        <div className="absolute top-10 right-0 z-30 w-52 rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
          <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Sort by
          </p>
          {options.map((opt) => {
            const active = opt.field === field
            return (
              <button
                key={opt.field}
                type="button"
                onClick={() => {
                  selectField(opt.field, opt.defaultDir)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                  active
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <span>{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            )
          })}

          {canToggleDir && (
            <>
              <div className="my-1.5 border-t border-border" />
              <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Order
              </p>
              <div className="grid grid-cols-2 gap-1 px-1 pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onChange(field, 'asc')
                    setOpen(false)
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    dir === 'asc'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <ArrowUp className="h-3 w-3" />
                  Ascending
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(field, 'desc')
                    setOpen(false)
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    dir === 'desc'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <ArrowDown className="h-3 w-3" />
                  Descending
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
