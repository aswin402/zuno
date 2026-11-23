import { Check, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DualThemePreset, ThemeId, ThemeMode } from '@/lib/appearance'

interface ThemeSelectorProps {
  themes: DualThemePreset[]
  value: ThemeId
  mode: ThemeMode
  onChange: (id: ThemeId, targetMode?: ThemeMode) => void
  className?: string
}

/**
 * Zenko-inspired ThemeSelector displaying unified dual-mode theme families
 * with 4:3 miniature Zuno music player previews & inline Dark/Light switches.
 */
export function ThemeSelector({
  themes,
  value,
  mode,
  onChange,
  className,
}: ThemeSelectorProps) {
  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (themes.length === 0) return
    const keyMap: Record<string, number> = {
      ArrowRight: (idx + 1) % themes.length,
      ArrowDown: (idx + 1) % themes.length,
      ArrowLeft: (idx - 1 + themes.length) % themes.length,
      ArrowUp: (idx - 1 + themes.length) % themes.length,
      Home: 0,
      End: themes.length - 1,
    }
    const nextIdx = keyMap[e.key]
    if (nextIdx !== undefined) {
      e.preventDefault()
      onChange(themes[nextIdx].id, mode)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange(themes[idx].id, mode)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Global color theme"
      className={cn('grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4', className)}
    >
      {themes.map((t, idx) => {
        const selected = value === t.id
        const pal = mode === 'light' ? t.light : t.dark

        return (
          <div
            key={t.id}
            role="radio"
            tabIndex={selected || idx === 0 ? 0 : -1}
            aria-checked={selected}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className="group relative flex flex-col gap-2 text-left focus:outline-none"
          >
            {/* 4:3 Miniature Zuno Player Preview */}
            <button
              type="button"
              tabIndex={-1}
              onClick={() => onChange(t.id, mode)}
              className="relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border p-2 text-left transition-transform duration-150 group-hover:-translate-y-0.5 active:scale-[0.98]"
              style={{
                backgroundColor: pal.background,
                borderColor: selected ? pal.primary : pal.border,
                boxShadow: selected ? `inset 0 0 0 1.5px ${pal.primary}` : undefined,
              }}
            >
              <div className="flex h-full w-full gap-1.5">
                {/* Mini Left Sidebar */}
                <div
                  className="flex w-[30%] flex-col justify-between rounded-lg border p-1.5"
                  style={{ backgroundColor: pal.card, borderColor: pal.border }}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: pal.primary }}
                      />
                      <span
                        className="h-1 w-6 rounded-full opacity-80"
                        style={{ backgroundColor: pal.foreground }}
                      />
                    </div>
                    <span
                      className="h-2.5 w-full rounded"
                      style={{ backgroundColor: pal.secondary }}
                    />
                    <span
                      className="h-1 w-4/5 rounded-full opacity-35"
                      style={{ backgroundColor: pal.foreground }}
                    />
                    <span
                      className="h-1 w-3/5 rounded-full opacity-25"
                      style={{ backgroundColor: pal.foreground }}
                    />
                  </div>
                  <span
                    className="h-1 w-1/2 rounded-full opacity-20"
                    style={{ backgroundColor: pal.foreground }}
                  />
                </div>

                {/* Mini Songs List + Floating Player Bar */}
                <div className="flex flex-1 flex-col justify-between py-0.5">
                  <div className="flex flex-col gap-1.5">
                    <span
                      className="h-1.5 w-10 rounded-full opacity-80"
                      style={{ backgroundColor: pal.foreground }}
                    />
                    {/* Active song row */}
                    <div
                      className="flex items-center justify-between rounded-md px-1.5 py-1"
                      style={{ backgroundColor: pal.secondary }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: pal.primary }}
                        />
                        <span
                          className="h-1 w-10 rounded-full opacity-85"
                          style={{ backgroundColor: pal.foreground }}
                        />
                      </div>
                      <span
                        className="h-1 w-3 rounded-full opacity-40"
                        style={{ backgroundColor: pal.mutedForeground }}
                      />
                    </div>
                    {/* Secondary song row */}
                    <div className="flex items-center justify-between px-1.5 py-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full opacity-40"
                          style={{ backgroundColor: pal.mutedForeground }}
                        />
                        <span
                          className="h-1 w-8 rounded-full opacity-45"
                          style={{ backgroundColor: pal.foreground }}
                        />
                      </div>
                      <span
                        className="h-1 w-3 rounded-full opacity-30"
                        style={{ backgroundColor: pal.mutedForeground }}
                      />
                    </div>
                  </div>

                  {/* Mini Floating Player Bar */}
                  <div
                    className="flex items-center gap-1.5 rounded-lg border px-1.5 py-1"
                    style={{ backgroundColor: pal.card, borderColor: pal.border }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: pal.primary }}
                    />
                    <span
                      className="h-[2px] flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: pal.accentBg }}
                    >
                      <span
                        className="block h-full w-3/5 rounded-full"
                        style={{ backgroundColor: pal.primary }}
                      />
                    </span>
                  </div>
                </div>
              </div>

              {selected && (
                <span
                  className="absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center rounded-full shadow-xs"
                  style={{
                    backgroundColor: pal.primary,
                    color: pal.primaryForeground,
                  }}
                >
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </button>

            {/* Theme Name + Inline Dark / Light Mode Switch */}
            <div className="flex items-center justify-between gap-2 px-0.5">
              <button
                type="button"
                onClick={() => onChange(t.id, mode)}
                className={cn(
                  'cursor-pointer truncate text-[12.5px] font-medium transition-colors',
                  selected
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              >
                {t.label}
              </button>

              <div
                className={cn(
                  'flex shrink-0 items-center rounded-md border border-border bg-secondary p-0.5 transition-opacity',
                  selected ? 'opacity-100' : 'opacity-65 group-hover:opacity-100',
                )}
              >
                <button
                  type="button"
                  aria-label={`${t.label} Dark mode`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(t.id, 'dark')
                  }}
                  className={cn(
                    'flex h-5 w-5 cursor-pointer items-center justify-center rounded-[4px] transition-colors',
                    selected && mode === 'dark'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Moon size={10.5} />
                </button>
                <button
                  type="button"
                  aria-label={`${t.label} Light mode`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(t.id, 'light')
                  }}
                  className={cn(
                    'flex h-5 w-5 cursor-pointer items-center justify-center rounded-[4px] transition-colors',
                    selected && mode === 'light'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sun size={10.5} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
