import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
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
    <div className="relative flex items-center gap-1.5">
      {/* EaseUI Sort field dropdown */}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip label="Choose sort field" side="top" disabled={open}>
          <DropdownMenuTrigger
            unstyled
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer',
              open && 'bg-secondary text-foreground',
            )}
            aria-label="Sort by"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>Sort: {activeOpt.label}</span>
          </DropdownMenuTrigger>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          {options.map((opt) => {
            const active = opt.field === field
            return (
              <DropdownMenuItem
                key={opt.field}
                onSelect={() => selectField(opt.field, opt.defaultDir)}
                className={cn(
                  'min-h-8 justify-between',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground',
                )}
              >
                <span>{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            )
          })}

          {canToggleDir && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Order</DropdownMenuLabel>
              <div className="grid grid-cols-2 gap-1 px-0.5 pb-0.5">
                <DropdownMenuItem
                  onSelect={() => onChange(field, 'asc')}
                  className={cn(
                    'min-h-8 justify-center gap-1 px-2',
                    dir === 'asc'
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary/90'
                      : 'text-muted-foreground',
                  )}
                >
                  <ArrowUp className="h-3 w-3" />
                  Ascending
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onChange(field, 'desc')}
                  className={cn(
                    'min-h-8 justify-center gap-1 px-2',
                    dir === 'desc'
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary/90'
                      : 'text-muted-foreground',
                  )}
                >
                  <ArrowDown className="h-3 w-3" />
                  Descending
                </DropdownMenuItem>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dedicated 1-click Ascending / Descending toggle */}
      {canToggleDir && (
        <Tooltip
          label={
            dir === 'asc'
              ? 'Ascending · click for Descending'
              : 'Descending · click for Ascending'
          }
          side="top"
        >
          <button
            type="button"
            onClick={() => onChange(field, dir === 'asc' ? 'desc' : 'asc')}
            className="flex h-8 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
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
        </Tooltip>
      )}
    </div>
  )
}
