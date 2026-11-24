import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  LayoutGrid,
  Palette,
  Play,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { ColorPicker } from '@/components/ColorPicker'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { CustomFontStudio } from '@/components/CustomFontStudio'
import {
  EaseThemeToggle,
  ThemeToggleGlyph,
  runThemeViewTransition,
} from '@/components/EaseThemeToggle'
import { Loader2 } from '@/components/PulseBarsLoader'
import { Scrubber } from '@/components/Scrubber'
import { ThemeSelector } from '@/components/ThemeSelector'
import { Tooltip } from '@/components/ui/tooltip'
import { VinylPlayButton, WaveformPlayButton } from '@/components/WaveformPlayButton'
import { WindowTitlebar } from '@/components/WindowTitlebar'
import { ZunoIcon } from '@/components/ZunoIcon'
import { cn } from '@/lib/utils'
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  ICON_PACK_OPTIONS,
  resolveEffectivePalette,
  THEME_PRESETS,
  type AppearanceSettings,
  type BgPatternId,
  type BorderStyleId,
  type CustomColorOverrides,
  type DensityId,
  type FontSizeId,
  type IconStrokeId,
  type PlayButtonStyleId,
  type PlayerBarStyleId,
  type PlayingStyleId,
  type RadiusStyleId,
  type ScrubberKnobStyleId,
  type SurfaceStyleId,
  type ThemeId,
  type ThemeMode,
  type ThemeToggleStyleId,
  type ThemeTransitionId,
  type ThemeTransitionStartId,
  type TitlebarAlignId,
  type TitlebarStyleId,
  type TrackIconStyleId,
} from '@/lib/appearance'

type StudioPageId =
  | 'color_themes'
  | 'window_chrome'
  | 'surfaces'
  | 'playing_track'
  | 'scrubber'
  | 'player_controls'
  | 'icons'

interface StudioNavItem {
  id: StudioPageId
  group: 'Global Theme' | 'Music Components'
  label: string
  description: string
  keywords: string
  icon: typeof Palette
}

const STUDIO_PAGES: StudioNavItem[] = [
  {
    id: 'color_themes',
    group: 'Global Theme',
    label: 'Color Themes & Fonts',
    description:
      'Dual-mode theme families, interactive 60/30/10 palette studio, and 18+ variable fonts with custom uploads.',
    keywords: 'theme dark light color palette hex accent vermilion oled font obel mono fontzz upload',
    icon: Palette,
  },
  {
    id: 'window_chrome',
    group: 'Global Theme',
    label: 'Top Titlebar & Window',
    description:
      'Customize the themed desktop top bar, close/minimize/restore controls, alignment, and live track pill.',
    keywords: 'titlebar top bar window chrome close minimize maximize restore macos traffic lights pill geometric',
    icon: AppWindow,
  },
  {
    id: 'surfaces',
    group: 'Global Theme',
    label: 'Surfaces, Toggle & Motion',
    description:
      'Surface materials, canvas patterns, Skiper 4 theme toggle buttons, Skiper 26 reveal transitions, and geometry.',
    keywords: 'surface glass flat bordered pattern dot grid glow vignette transition blinds circle polygon skiper4 skiper26 toggle radius density text size',
    icon: Layers,
  },
  {
    id: 'playing_track',
    group: 'Music Components',
    label: 'Playing Track Style',
    description:
      'Choose how the currently playing song animates across Songs, Last Played, and Playlists.',
    keywords: 'playing active song equalizer pulse ring pulse bars loader minimal animation',
    icon: Play,
  },
  {
    id: 'scrubber',
    group: 'Music Components',
    label: 'Progress Scrubber',
    description:
      'Customize the seek bar & playhead across the desktop player bar and mobile full-screen player.',
    keywords: 'scrubber progress seek bar waveform ticks capsule pill ring solid line',
    icon: Sliders,
  },
  {
    id: 'player_controls',
    group: 'Music Components',
    label: 'Player & Transitions',
    description:
      'Audio fade-in / crossfade transitions, play button style, desktop bar layout, and visibility toggles.',
    keywords: 'player bar floating docked waveform button fade crossfade transition audio last played duration overline',
    icon: LayoutGrid,
  },
  {
    id: 'icons',
    group: 'Music Components',
    label: 'Icons & Geometry',
    description:
      'Switch between 8 curated icon packs (including animated hover sets), stroke weights, and leading markers.',
    keywords: 'icons lucide tabler iconsax hugeicons itshover pulsoicon humbleicons majesticons stroke weight',
    icon: Sparkles,
  },
]

interface CustomColorSlot {
  key: keyof CustomColorOverrides
  label: string
  hint: string
  presets: string[]
}

const CUSTOM_COLOR_SLOTS: CustomColorSlot[] = [
  {
    key: 'primary',
    label: 'Primary Accent (10%)',
    hint: 'Active buttons, indicators & scrubber fill',
    presets: ['#fafafa', '#ea5829', '#f59e0b', '#10b981', '#3b82f6', '#818cf8', '#e11d48'],
  },
  {
    key: 'background',
    label: 'Canvas Background (60%)',
    hint: 'Main matte workspace background',
    presets: ['#09090b', '#000000', '#0e0c0a', '#0a0c14', '#ffffff', '#f7f5f0'],
  },
  {
    key: 'secondary',
    label: 'Secondary Surface (30%)',
    hint: 'Active rows, hover fills & pills',
    presets: ['#18181b', '#121216', '#211c17', '#181e30', '#f4f4f5', '#ede9e0'],
  },
  {
    key: 'card',
    label: 'Card & Sidebar Surface',
    hint: 'Sidebar, floating bar & elevated cards',
    presets: ['#121215', '#0a0a0c', '#181411', '#121624', '#f8f8f9', '#ffffff'],
  },
  {
    key: 'border',
    label: 'Hairline Border',
    hint: 'Structural 1px dividers & edges',
    presets: ['#27272a', '#1e1e24', '#2e2721', '#242a40', '#e4e4e7', '#dfdad0'],
  },
  {
    key: 'foreground',
    label: 'Primary Text',
    hint: 'Song titles, headings & labels',
    presets: ['#fafafa', '#ffffff', '#f8f4ef', '#f1f5f9', '#09090b', '#1c1917'],
  },
  {
    key: 'mutedForeground',
    label: 'Muted Text',
    hint: 'Artists, timestamps & subtle captions',
    presets: ['#a1a1aa', '#8e8e97', '#9d9287', '#8c96b0', '#71717a', '#64748b'],
  },
]

interface CustomizePageProps {
  settings: AppearanceSettings
  onChange: (patch: Partial<AppearanceSettings>) => void
  onReset: () => void
  onBack: () => void
}

/**
 * Full-Screen Appearance & Audio Studio tailored for Zuno:
 * Left tree sidebar with Back button & `/` search + Right live preview stage & granular controls.
 */
export function CustomizePage({
  settings,
  onChange,
  onReset,
  onBack,
}: CustomizePageProps) {
  const [activePage, setActivePage] = useState<StudioPageId>('color_themes')
  const [searchQuery, setSearchQuery] = useState('')
  const [previewScrub, setPreviewScrub] = useState(42)
  const [previewPlaying, setPreviewPlaying] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  const currentIdx = STUDIO_PAGES.findIndex((p) => p.id === activePage)
  const currentMeta = STUDIO_PAGES[currentIdx] ?? STUDIO_PAGES[0]
  const palette = useMemo(() => resolveEffectivePalette(settings), [settings])

  const isModified =
    JSON.stringify(settings) !== JSON.stringify(DEFAULT_APPEARANCE)
  const hasCustomColors = Object.values(settings.customColors ?? {}).some(Boolean)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (e.key === 'Escape' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        onBack()
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBack])

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return STUDIO_PAGES
    return STUDIO_PAGES.filter((p) =>
      `${p.label} ${p.description} ${p.keywords}`.toLowerCase().includes(q),
    )
  }, [searchQuery])

  const goStep = (delta: number) => {
    const next = STUDIO_PAGES[(currentIdx + delta + STUDIO_PAGES.length) % STUDIO_PAGES.length]
    setActivePage(next.id)
  }

  const handleSelectTheme = (id: ThemeId, targetMode?: ThemeMode) => {
    const nextMode = targetMode ?? settings.mode
    const apply = () =>
      onChange({
        theme: id,
        mode: nextMode,
        accent: 'mono',
        customColors: {},
      })
    if (nextMode !== settings.mode) {
      runThemeViewTransition(apply, {
        variant: settings.themeTransition,
        start: settings.themeTransitionStart,
      })
    } else {
      apply()
    }
  }

  const handleToggleMode = () => {
    onChange({ mode: settings.mode === 'dark' ? 'light' : 'dark' })
  }

  const updateCustomColor = (key: keyof CustomColorOverrides, hex: string) => {
    onChange({
      customColors: {
        ...(settings.customColors ?? {}),
        [key]: hex,
      },
    })
  }

  return (
    <div className="zuno-canvas flex h-full min-h-0 w-full flex-col bg-background lg:flex-row">
      {/* Desktop Left Hierarchical Studio Sidebar (Full-Screen Studio) */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-border bg-card/60 lg:flex">
        {/* Top Back Button + Studio Title */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Customize
          </span>
        </div>

        <div className="border-b border-border/70 px-3 py-3">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredPages[0]) {
                  setActivePage(filteredPages[0].id)
                } else if (e.key === 'Escape') {
                  setSearchQuery('')
                  searchRef.current?.blur()
                }
              }}
              placeholder="Search studio... (/)"
              aria-label="Search Customize Studio"
              className="w-full rounded-xl border border-border bg-card py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <CompactScrollArea className="flex-1" viewportClassName="px-2.5 py-3.5">
          {(['Global Theme', 'Music Components'] as const).map((grp) => {
            const items = filteredPages.filter((p) => p.group === grp)
            if (items.length === 0) return null
            return (
              <div key={grp} className="mb-5 last:mb-0">
                <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  {grp}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon
                    const active = activePage === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActivePage(item.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] transition-colors cursor-pointer',
                          active
                            ? 'bg-secondary font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            active ? 'text-primary' : 'text-muted-foreground',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </CompactScrollArea>
      </aside>

      {/* Right Full-Screen Studio Stage */}
      <CompactScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl space-y-6 px-5 pb-14 pt-5 sm:px-10 sm:pt-7">
          {/* Mobile Top Back Bar + Horizontal Studio Nav Pills */}
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </button>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Appearance Studio
            </span>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 zuno-scrollbar-hide lg:hidden">
            {STUDIO_PAGES.map((item) => {
              const Icon = item.icon
              const active = activePage === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id)}
                  className={cn(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors cursor-pointer',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-muted-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* Studio Stage Header + Breadcrumb + Prev/Next */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                Appearance Studio / {currentMeta.group}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
                {currentMeta.label}
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                {currentMeta.description}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <EaseThemeToggle
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggle={handleToggleMode}
                size="md"
              />
              {isModified && (
                <Tooltip label="Restore all defaults" side="bottom">
                  <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                </Tooltip>
              )}
              <Tooltip label="Previous section" side="bottom">
                <button
                  type="button"
                  onClick={() => goStep(-1)}
                  aria-label="Previous section"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip label="Next section" side="bottom">
                <button
                  type="button"
                  onClick={() => goStep(1)}
                  aria-label="Next section"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ═══════════════════ 1. COLOR THEMES & FONTS ═══════════════════ */}
          {activePage === 'color_themes' && (
            <div className="space-y-7">
              {/* 4:3 Dark & Light ThemeSelector Grids */}
              <ThemeSelector
                themes={THEME_PRESETS}
                value={settings.theme}
                mode={settings.mode}
                onChange={handleSelectTheme}
              />

              {/* Custom 60/30/10 Palette Studio */}
              <section className="z-surface-card space-y-5 rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Sliders className="h-4 w-4 text-primary" />
                      <span>Custom Palette Studio</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Quick-swap your 10% accent swatch or fine-tune any surface color with the interactive HSV picker.
                    </p>
                  </div>
                  {(hasCustomColors || settings.accent !== 'mono') && (
                    <button
                      type="button"
                      onClick={() => onChange({ accent: 'mono', customColors: {} })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore Preset Colors
                    </button>
                  )}
                </div>

                {/* Quick Accent Swatches */}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Quick Accent Swatches (10%)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_PRESETS.map((acc) => {
                      const active =
                        !settings.customColors?.primary && settings.accent === acc.id
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() =>
                            onChange({
                              accent: acc.id,
                              customColors: {
                                ...(settings.customColors ?? {}),
                                primary: undefined,
                              },
                            })
                          }
                          className={cn(
                            'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                            active
                              ? 'border-primary bg-secondary text-foreground'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-border"
                            style={{
                              backgroundColor:
                                acc.id === 'mono'
                                  ? settings.mode === 'light'
                                    ? '#18181b'
                                    : '#fafafa'
                                  : acc.swatch,
                            }}
                          />
                          <span>{acc.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Interactive HSV Color Pickers for every 60/30/10 slot */}
                <div className="grid grid-cols-1 gap-3 border-t border-border/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  {CUSTOM_COLOR_SLOTS.map((slot) => (
                    <div
                      key={slot.key}
                      className="relative flex flex-col gap-2 rounded-xl border border-border bg-background/50 p-3 focus-within:z-30"
                    >
                      <div>
                        <div className="text-xs font-medium text-foreground">
                          {slot.label}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {slot.hint}
                        </div>
                      </div>
                      <ColorPicker
                        value={palette[slot.key]}
                        presets={slot.presets}
                        label={slot.label}
                        onChange={(hex) => updateCustomColor(slot.key, hex)}
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Custom Font Studio (18 self-hosted UI fonts + 6 Mono + OS Fonts + Upload) */}
              <CustomFontStudio settings={settings} onChange={onChange} />
            </div>
          )}

          {/* ═══════════════════ 1B. TOP TITLEBAR & WINDOW ═══════════════════ */}
          {activePage === 'window_chrome' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Live Custom Desktop Titlebar Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-lg">
                  <WindowTitlebar
                    preview
                    styleVariant={settings.titlebarStyle}
                    align={settings.titlebarAlign}
                    showTrack={settings.titlebarShowTrack}
                    compact={settings.titlebarCompact}
                    currentTrack={{
                      id: 'preview',
                      rel_path: 'preview.mp3',
                      title: 'midnight_chords',
                      artist: 'Ambient',
                      album: '',
                      genre: null,
                      duration_secs: 212,
                      file_size: 0,
                      modified_secs: 0,
                      folder: '',
                      has_cover: false,
                    }}
                    isPlaying
                  />
                  <div className="flex h-20 items-center justify-center bg-background/80 px-4 text-xs text-muted-foreground">
                    Theme-matched native desktop window chrome (drag bar to move · double-click to maximize)
                  </div>
                </div>
              </LivePreviewStage>

              <Group
                title="Window Controls Style"
                description="Style of the Close, Minimize, and Maximize / Restore buttons in the top bar."
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      {
                        id: 'minimal',
                        label: 'Minimal Mono',
                        desc: 'Quiet circular buttons with soft hover highlights',
                      },
                      {
                        id: 'macos',
                        label: 'Traffic Lights',
                        desc: 'Compact dots that glow red, amber & green on hover',
                      },
                      {
                        id: 'dots',
                        label: 'Monochrome Dots',
                        desc: 'Strict monochrome dots matched to your active theme',
                      },
                      {
                        id: 'pill',
                        label: 'Floating Pill',
                        desc: 'Window controls grouped inside a rounded pill capsule',
                      },
                      {
                        id: 'geometric',
                        label: 'Sharp Studio',
                        desc: 'Bordered square hardware keys with hairline dividers',
                      },
                    ] as { id: TitlebarStyleId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.titlebarStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ titlebarStyle: opt.id })}
                        className={cn(
                          'flex flex-col gap-1 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            {opt.label}
                          </span>
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </Group>

              <Group
                title="Controls Alignment"
                description="Choose which side of the top bar holds Minimize, Maximize, and Close."
              >
                <Segmented<TitlebarAlignId>
                  value={settings.titlebarAlign}
                  onChange={(titlebarAlign) => onChange({ titlebarAlign })}
                  options={[
                    { value: 'right', label: 'Right (Linux / Windows)' },
                    { value: 'left', label: 'Left (macOS)' },
                  ]}
                />
              </Group>

              <Group
                title="Titlebar Behavior"
                description="Fine-tune top bar density and active song badge."
              >
                <div className="z-surface-card divide-y divide-border rounded-2xl border border-border bg-card">
                  <ToggleRow
                    label="Show playing track in titlebar"
                    description="Display a centered pill with the current song title & live indicator."
                    checked={settings.titlebarShowTrack}
                    onChange={(titlebarShowTrack) => onChange({ titlebarShowTrack })}
                  />
                  <ToggleRow
                    label="Ultra-slim compact titlebar"
                    description="Shrink top bar height from 36px to 30px for maximum canvas space."
                    checked={settings.titlebarCompact}
                    onChange={(titlebarCompact) => onChange({ titlebarCompact })}
                  />
                </div>
              </Group>
            </div>
          )}

          {/* ═══════════════════ 2. SURFACES, TOGGLE & MOTION ═══════════════════ */}
          {activePage === 'surfaces' && (
            <div className="space-y-6">
              <Group
                title="Surface Material"
                description="Controls the physical finish of Studio cards, panels, and elevated surfaces."
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      { id: 'bordered', label: 'Framed Bordered', desc: 'Crisp card fill + 1px edge' },
                      { id: 'flat', label: 'Flat Matte', desc: 'Quiet secondary surface, no border' },
                      { id: 'minimal_top', label: 'Minimal Hairline', desc: 'Top divider only, zero box weight' },
                      { id: 'borderless', label: 'Borderless Fill', desc: 'Soft tonal separation' },
                      { id: 'glass', label: 'Frosted Glass', desc: 'Translucent backdrop blur' },
                      { id: 'elevated', label: 'Elevated Soft', desc: 'Floating depth shadow' },
                    ] as { id: SurfaceStyleId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.surfaceStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ surfaceStyle: opt.id })}
                        className={cn(
                          'z-surface-card flex flex-col gap-1 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            {opt.label}
                          </span>
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </Group>

              <Group
                title="Canvas Background Pattern"
                description="Optional subtle ambient texture on the workspace canvas (inherits your active theme)."
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {(
                    [
                      { id: 'clean', label: 'Clean' },
                      { id: 'dot_grid', label: 'Dot Grid' },
                      { id: 'fine_grid', label: 'Fine Grid' },
                      { id: 'top_glow', label: 'Top Glow' },
                      { id: 'vignette', label: 'Vignette' },
                    ] as { id: BgPatternId; label: string }[]
                  ).map((opt) => {
                    const active = settings.bgPattern === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ bgPattern: opt.id })}
                        className={cn(
                          'flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <span>{opt.label}</span>
                        {active && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </Group>

              <Group
                title="Theme Toggle Button Style (Skiper 4)"
                description="Choose the animated Dark / Light toggle button icon shown in the sidebar, navbar, and studio."
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      { id: 'eclipse', label: 'Eclipse Mask', desc: 'Smooth crescent cutout & sun rays' },
                      { id: 'skiper-1', label: 'Split Disc', desc: 'Skiper 4 · Rotating Yin-Yang half disc' },
                      { id: 'skiper-2', label: 'Horizon Sun', desc: 'Skiper 4 · Rising sun over horizon' },
                      { id: 'skiper-3', label: 'Expand Dot', desc: 'Skiper 4 · Dotted sun morphing orb' },
                      { id: 'skiper-4', label: 'Orbital Ring', desc: 'Skiper 4 · Orbiting lunar satellite' },
                      { id: 'skiper-5', label: 'Switch Pill', desc: 'Skiper 4 · Sliding capsule toggle' },
                    ] as { id: ThemeToggleStyleId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.themeToggleStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ themeToggleStyle: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {opt.label}
                            </span>
                            {active && <Check className="h-3 w-3 shrink-0 text-primary" />}
                          </div>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {opt.desc}
                          </span>
                        </div>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground">
                          <ThemeToggleGlyph
                            style={opt.id}
                            isDark={settings.mode === 'dark'}
                            maskId={`preview-${opt.id}`}
                            className="h-4 w-4"
                          />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Group>

              <Group
                title="Dark / Light Reveal Transition (Skiper 26)"
                description="View Transition reveal animation & starting origin when switching between Dark and Light mode."
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      { id: 'circle-blur', label: 'Circle Blur', desc: 'Soft blurred radial ripple' },
                      { id: 'circle', label: 'Crisp Circle', desc: 'Sharp geometric circle expand' },
                      { id: 'polygon', label: 'Diagonal Polygon', desc: 'Skiper 26 · Angled polygon wipe' },
                      { id: 'bottom-up', label: 'Bottom-Up Curtain', desc: 'Skiper 26 · Rising vertical reveal' },
                      { id: 'rectangle', label: 'Top-Down Sweep', desc: 'Clean downward curtain' },
                      { id: 'blinds', label: 'Venetian Blinds', desc: 'Slatted architectural reveal' },
                    ] as { id: ThemeTransitionId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.themeTransition === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onChange({ themeTransition: opt.id })
                        }}
                        className={cn(
                          'flex flex-col gap-1 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <Wand2 className="h-3 w-3 text-primary" />
                            {opt.label}
                          </span>
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Segmented<ThemeTransitionStartId>
                    value={settings.themeTransitionStart}
                    onChange={(themeTransitionStart) => onChange({ themeTransitionStart })}
                    options={[
                      { value: 'trigger', label: 'From Button' },
                      { value: 'center', label: 'Center' },
                      { value: 'top-left', label: 'Top Left' },
                      { value: 'top-right', label: 'Top Right' },
                      { value: 'bottom-left', label: 'Bottom Left' },
                      { value: 'bottom-right', label: 'Bottom Right' },
                    ]}
                  />

                  <button
                    type="button"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      runThemeViewTransition(handleToggleMode, {
                        variant: settings.themeTransition,
                        start: settings.themeTransitionStart,
                        origin: {
                          x: Math.round(rect.left + rect.width / 2),
                          y: Math.round(rect.top + rect.height / 2),
                        },
                      })
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer"
                  >
                    <Wand2 className="h-3.5 w-3.5 text-primary" />
                    <span>Preview Transition</span>
                  </button>
                </div>
              </Group>

              <div className="grid gap-6 sm:grid-cols-2">
                <Group title="Corner Radius" description="Roundness across song rows and cards.">
                  <Segmented<RadiusStyleId>
                    value={settings.radius}
                    onChange={(radius) => onChange({ radius })}
                    options={[
                      { value: 'sharp', label: 'Sharp' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'round', label: 'Round' },
                    ]}
                  />
                </Group>

                <Group title="List Density" description="Spacing between songs in lists.">
                  <Segmented<DensityId>
                    value={settings.density}
                    onChange={(density) => onChange({ density })}
                    options={[
                      { value: 'compact', label: 'Compact' },
                      { value: 'comfortable', label: 'Comfortable' },
                      { value: 'spacious', label: 'Spacious' },
                    ]}
                  />
                </Group>

                <Group title="Borders & Dividers" description="Hairline contrast across chrome.">
                  <Segmented<BorderStyleId>
                    value={settings.borders}
                    onChange={(borders) => onChange({ borders })}
                    options={[
                      { value: 'borderless', label: 'Borderless' },
                      { value: 'subtle', label: 'Subtle' },
                      { value: 'crisp', label: 'Crisp' },
                    ]}
                  />
                </Group>

                <Group title="Text Size" description="Global typography scale.">
                  <Segmented<FontSizeId>
                    value={settings.fontSize}
                    onChange={(fontSize) => onChange({ fontSize })}
                    options={[
                      { value: 'sm', label: 'Small' },
                      { value: 'md', label: 'Default' },
                      { value: 'lg', label: 'Large' },
                    ]}
                  />
                </Group>
              </div>
            </div>
          )}

          {/* ═══════════════════ 3. PLAYING TRACK STYLE ═══════════════════ */}
          {activePage === 'playing_track' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Active Song Row Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <div
                  onClick={() => setPreviewPlaying((p) => !p)}
                  className="flex w-full max-w-md cursor-pointer items-center justify-between gap-3.5 rounded-2xl bg-secondary px-3.5 py-3 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    {settings.playingStyle === 'equalizer' ||
                    settings.playingStyle === 'pulse-bars' ? (
                      <div className="h-10 w-10 rounded-lg border border-border bg-card" />
                    ) : settings.playingStyle === 'pulse' ? (
                      <div className="relative flex h-9 w-9 items-center justify-center">
                        {previewPlaying && settings.showPlayPulse && (
                          <span className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary" />
                        )}
                        <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <ZunoIcon
                            name={previewPlaying ? 'pause' : 'play'}
                            pack={settings.iconPack}
                            filled
                            className="h-3.5 w-3.5"
                          />
                        </div>
                      </div>
                    ) : (
                      <ZunoIcon
                        name={previewPlaying ? 'pause' : 'play'}
                        pack={settings.iconPack}
                        filled
                        className="h-4 w-4 text-primary"
                      />
                    )}
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        AMBIENT
                      </p>
                      <p className="text-sm font-medium text-primary">midnight_chords</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {settings.playingStyle === 'equalizer' && previewPlaying && (
                      <span className="flex h-5 items-end gap-[2.5px]">
                        <span className="zuno-eq-bar" />
                        <span className="zuno-eq-bar" />
                        <span className="zuno-eq-bar" />
                        <span className="zuno-eq-bar" />
                      </span>
                    )}
                    {settings.playingStyle === 'pulse-bars' && previewPlaying && (
                      <Loader2 barCount={5} height={16} width={2.5} gap={2} speed={0.95} />
                    )}
                    <span className="font-mono text-xs text-muted-foreground">00:12</span>
                  </div>
                </div>
              </LivePreviewStage>

              <Group
                title="Active Playing Song Theme"
                description="Choose how the currently playing song animates in song lists."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        id: 'pulse',
                        label: 'Pulse Ring',
                        desc: 'Circular Play/Pause button with subtle ring pulse',
                      },
                      {
                        id: 'equalizer',
                        label: 'Equalizer Bars',
                        desc: 'Square album cover tile + 4 dancing equalizer bars',
                      },
                      {
                        id: 'pulse-bars',
                        label: 'Pulse Bars',
                        desc: 'Square album cover tile + 5 centered pulsing bars',
                      },
                      {
                        id: 'minimal',
                        label: 'Minimal',
                        desc: 'Quiet text highlight with clean icon morph',
                      },
                    ] as { id: PlayingStyleId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.playingStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ playingStyle: opt.id })}
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-2xl border p-4 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/60',
                        )}
                      >
                        <div className="flex h-11 items-center justify-between rounded-xl border border-border bg-background px-3">
                          <div className="flex items-center gap-2.5">
                            {opt.id === 'equalizer' || opt.id === 'pulse-bars' ? (
                              <span className="h-6 w-6 rounded-md border border-border bg-secondary" />
                            ) : opt.id === 'pulse' ? (
                              <span className="relative flex h-6 w-6 items-center justify-center">
                                <span className="animate-btn-pulse absolute inset-0 rounded-full border border-primary" />
                                <span className="h-5 w-5 rounded-full bg-primary" />
                              </span>
                            ) : (
                              <ZunoIcon
                                name="pause"
                                pack={settings.iconPack}
                                filled
                                className="h-3.5 w-3.5 text-primary"
                              />
                            )}
                            <span className="text-xs font-medium text-foreground">Track</span>
                          </div>

                          {opt.id === 'equalizer' && (
                            <span className="flex h-5 items-end gap-[2px]">
                              <span className="zuno-eq-bar" />
                              <span className="zuno-eq-bar" />
                              <span className="zuno-eq-bar" />
                              <span className="zuno-eq-bar" />
                            </span>
                          )}
                          {opt.id === 'pulse-bars' && (
                            <Loader2 barCount={5} height={16} width={2.5} gap={2} speed={0.95} />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">
                              {opt.label}
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>
            </div>
          )}

          {/* ═══════════════════ 4. PROGRESS SCRUBBER ═══════════════════ */}
          {activePage === 'scrubber' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Interactive Scrubber Preview (drag to test)"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <div className="flex w-full max-w-lg items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    00:{String(Math.round(previewScrub * 0.6)).padStart(2, '0')}
                  </span>
                  <Scrubber
                    value={previewScrub}
                    max={100}
                    styleVariant={settings.scrubberKnob}
                    seed="studio-live-scrubber"
                    onChange={setPreviewScrub}
                    className="flex-1"
                  />
                  <span className="font-mono text-xs text-muted-foreground">01:00</span>
                </div>
              </LivePreviewStage>

              <Group
                title="Progress Scrubber Style"
                description="Choose the seek rail & playhead style across desktop and mobile."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      { id: 'ring', label: 'Hollow Ring', desc: 'Hairline rail + ring handle' },
                      { id: 'solid', label: 'Solid Dot', desc: 'Hairline rail + filled dot' },
                      { id: 'line', label: 'Minimal Line', desc: 'Clean line, handle on hover' },
                      { id: 'pill', label: 'Vertical Pill', desc: 'Hardware-style vertical marker' },
                      { id: 'capsule', label: 'Capsule Bar', desc: 'Thick pill progress fill' },
                      { id: 'waveform', label: 'Waveform Bars', desc: 'Audio waveform scrub rail' },
                      { id: 'ticks', label: 'Segmented Ticks', desc: 'Precision studio ruler ticks' },
                    ] as { id: ScrubberKnobStyleId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.scrubberKnob === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ scrubberKnob: opt.id })}
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/60',
                        )}
                      >
                        <div className="rounded-xl border border-border bg-background px-3 py-2">
                          <Scrubber
                            value={46}
                            max={100}
                            styleVariant={opt.id}
                            seed={`preview-${opt.id}`}
                            compact
                            interactive={false}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                              {opt.label}
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>
            </div>
          )}

          {/* ═══════════════════ 5. PLAYER & TRANSITIONS ═══════════════════ */}
          {activePage === 'player_controls' && (
            <div className="space-y-6">
              {/* Audio Crossfade & Fade-In Transition Controls */}
              <Group
                title="Audio Transitions (Crossfade & Fade-In)"
                description="Smoothly fade out the ending of the current song while fading in the next song for seamless DJ-style transitions."
              >
                <div className="z-surface-card space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Crossfade &amp; Fade-In Duration
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {settings.crossfadeSecs > 0
                          ? `Outgoing track fades out over ${settings.crossfadeSecs.toFixed(settings.crossfadeSecs % 1 === 0 ? 0 : 1)}s while the next track smoothly fades in.`
                          : 'Off — tracks switch instantaneously without overlapping fades.'}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs font-semibold tabular-nums text-foreground">
                      {settings.crossfadeSecs > 0
                        ? `${settings.crossfadeSecs.toFixed(settings.crossfadeSecs % 1 === 0 ? 0 : 1)}s`
                        : 'Off'}
                    </span>
                  </div>

                  {/* Visual Crossfade Curve Preview */}
                  <div className="relative h-14 w-full overflow-hidden rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                    <svg
                      viewBox="0 0 320 44"
                      preserveAspectRatio="none"
                      className="h-full w-full"
                      aria-hidden="true"
                    >
                      {settings.crossfadeSecs > 0 ? (
                        <>
                          {/* Outgoing fade-out curve */}
                          <path
                            d={`M 0 8 L ${Math.max(70, 160 - settings.crossfadeSecs * 8)} 8 C ${Math.max(100, 160 - settings.crossfadeSecs * 2)} 8, ${Math.min(250, 160 + settings.crossfadeSecs * 4)} 38, ${Math.min(290, 160 + settings.crossfadeSecs * 10)} 38`}
                            fill="none"
                            stroke="var(--muted-foreground)"
                            strokeOpacity="0.55"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          {/* Incoming fade-in curve */}
                          <path
                            d={`M ${Math.max(30, 160 - settings.crossfadeSecs * 10)} 38 C ${Math.max(70, 160 - settings.crossfadeSecs * 4)} 38, ${Math.min(220, 160 + settings.crossfadeSecs * 2)} 8, ${Math.min(250, 160 + settings.crossfadeSecs * 8)} 8 L 320 8`}
                            fill="none"
                            stroke="var(--primary)"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          />
                        </>
                      ) : (
                        <>
                          <path
                            d="M 0 10 L 158 10 L 158 38"
                            fill="none"
                            stroke="var(--muted-foreground)"
                            strokeOpacity="0.45"
                            strokeWidth="2"
                          />
                          <path
                            d="M 162 38 L 162 10 L 320 10"
                            fill="none"
                            stroke="var(--primary)"
                            strokeWidth="2"
                          />
                        </>
                      )}
                    </svg>
                  </div>

                  {/* Quick duration chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[0, 1, 2, 3, 5, 8].map((sec) => {
                      const active = Math.abs(settings.crossfadeSecs - sec) < 0.05
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => onChange({ crossfadeSecs: sec })}
                          className={cn(
                            'h-8 rounded-full px-3.5 text-xs font-medium tabular-nums transition-colors cursor-pointer',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )}
                        >
                          {sec === 0 ? 'Off' : `${sec}s`}
                        </button>
                      )
                    })}
                  </div>

                  {/* Fine-grained 0..10s slider */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="font-mono text-[10.5px] text-muted-foreground">0s</span>
                    <input
                      type="range"
                      aria-label="Audio crossfade duration in seconds"
                      min={0}
                      max={10}
                      step={0.5}
                      value={settings.crossfadeSecs}
                      onChange={(e) =>
                        onChange({ crossfadeSecs: Number(e.target.value) })
                      }
                      className="h-1.5 flex-1 cursor-pointer accent-primary"
                    />
                    <span className="font-mono text-[10.5px] text-muted-foreground">10s</span>
                  </div>
                </div>
              </Group>

              <Group
                title="Play Button Style (Skiper 25)"
                description="Choose between classic Play/Pause, animated waveform bars, or spinning vinyl disc."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(
                    [
                      {
                        id: 'classic',
                        label: 'Classic Icon',
                        desc: 'Clean monochrome Play / Pause symbol',
                      },
                      {
                        id: 'waveform',
                        label: 'Waveform Toggle',
                        desc: 'Skiper 25 · 5-bar spring audio waveform',
                      },
                      {
                        id: 'vinyl',
                        label: 'Spinning Vinyl',
                        desc: 'Skiper 25 · Grooved record disc toggle',
                      },
                    ] as { id: PlayButtonStyleId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.playButtonStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ playButtonStyle: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/60',
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{opt.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                        </div>
                        {opt.id === 'waveform' ? (
                          <span className="pointer-events-none">
                            <WaveformPlayButton isPlaying onClick={() => {}} />
                          </span>
                        ) : opt.id === 'vinyl' ? (
                          <span className="pointer-events-none">
                            <VinylPlayButton isPlaying onClick={() => {}} />
                          </span>
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <ZunoIcon
                              name="play"
                              pack={settings.iconPack}
                              filled
                              className="h-4 w-4 translate-x-[0.5px]"
                            />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </Group>

              <Group
                title="Desktop Player Bar"
                description="Style of the bottom horizontal playback bar on desktop."
              >
                <Segmented<PlayerBarStyleId>
                  value={settings.playerBarStyle}
                  onChange={(playerBarStyle) => onChange({ playerBarStyle })}
                  options={[
                    { value: 'floating', label: 'Floating Sticky' },
                    { value: 'docked', label: 'Docked Full-Width' },
                  ]}
                />
              </Group>

              <Group
                title="Visible Elements"
                description="Show or hide UI components to keep your player as minimal as you like."
              >
                <div className="z-surface-card divide-y divide-border rounded-2xl border border-border bg-card">
                  <ToggleRow
                    label="Play button pulse animation"
                    description="Show a subtle ring pulse on the active track's Play/Pause button."
                    checked={settings.showPlayPulse}
                    onChange={(showPlayPulse) => onChange({ showPlayPulse })}
                  />
                  <ToggleRow
                    label="Artist / folder overline"
                    description="Show the uppercase artist or folder label above each song title."
                    checked={settings.showTrackOverline}
                    onChange={(showTrackOverline) => onChange({ showTrackOverline })}
                  />
                  <ToggleRow
                    label="Track duration"
                    description="Show song lengths on the right side of track rows."
                    checked={settings.showTrackDuration}
                    onChange={(showTrackDuration) => onChange({ showTrackDuration })}
                  />
                </div>
              </Group>
            </div>
          )}

          {/* ═══════════════════ 6. ICONS & GEOMETRY ═══════════════════ */}
          {activePage === 'icons' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Live Icon Pack Preview (hover icons to test animation)"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {(
                    [
                      'music',
                      'play',
                      'pause',
                      'heart',
                      'search',
                      'equalizer',
                      'shuffle',
                      'repeat',
                      'volume',
                      'customize',
                    ] as const
                  ).map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:border-primary/60 hover:bg-secondary cursor-pointer"
                    >
                      <ZunoIcon name={name} pack={settings.iconPack} className="h-4.5 w-4.5" />
                    </button>
                  ))}
                </div>
              </LivePreviewStage>

              <Group
                title="Icon Pack (incl. Skiper 99)"
                description="Choose from 9 curated vector packs including Skiper 99 kinetic animated icons."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {ICON_PACK_OPTIONS.map((pack) => {
                    const active = settings.iconPack === pack.id
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => onChange({ iconPack: pack.id })}
                        className={cn(
                          'group flex flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/60',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-foreground">
                            <ZunoIcon name="music" pack={pack.id} className="h-4 w-4" />
                            <ZunoIcon name="play" pack={pack.id} className="h-4 w-4" />
                            <ZunoIcon name="heart" pack={pack.id} className="h-4 w-4" />
                            <ZunoIcon name="equalizer" pack={pack.id} className="h-4 w-4" />
                          </div>
                          {pack.animated && !active && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] text-primary">
                              anim
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                              {pack.label}
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {pack.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>

              <div className="grid gap-6 sm:grid-cols-2">
                <Group
                  title="Icon Stroke Weight"
                  description="Changes line weight of every icon across the app."
                >
                  <Segmented<IconStrokeId>
                    value={settings.iconStroke}
                    onChange={(iconStroke) => onChange({ iconStroke })}
                    options={[
                      { value: 'thin', label: 'Thin' },
                      { value: 'regular', label: 'Regular' },
                      { value: 'bold', label: 'Bold' },
                    ]}
                  />
                </Group>

                <Group
                  title="Track Leading Icon"
                  description="Choose play indicator style in Pulse Ring mode."
                >
                  <Segmented<TrackIconStyleId>
                    value={settings.trackIconStyle}
                    onChange={(trackIconStyle) => onChange({ trackIconStyle })}
                    options={[
                      { value: 'ring', label: 'Ring' },
                      { value: 'filled', label: 'Filled' },
                      { value: 'minimal', label: 'Minimal' },
                      { value: 'number', label: 'Number' },
                    ]}
                  />
                </Group>
              </div>
            </div>
          )}
        </div>
      </CompactScrollArea>
    </div>
  )
}

function LivePreviewStage({
  title,
  mode,
  transition,
  transitionStart,
  toggleStyle,
  onToggleMode,
  children,
}: {
  title: string
  mode: ThemeMode
  transition: ThemeTransitionId
  transitionStart?: ThemeTransitionStartId
  toggleStyle?: ThemeToggleStyleId
  onToggleMode: () => void
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2 font-mono text-[11px] text-muted-foreground">
        <span>{title}</span>
        <EaseThemeToggle
          mode={mode}
          transition={transition}
          transitionStart={transitionStart}
          toggleStyle={toggleStyle}
          onToggle={onToggleMode}
          size="sm"
        />
      </div>
      <div className="flex min-h-[144px] items-center justify-center p-6">{children}</div>
    </div>
  )
}

function Group({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-xl px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 cursor-pointer"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-accent',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full transition-transform',
            checked
              ? 'translate-x-[18px] bg-primary-foreground'
              : 'translate-x-[3px] bg-muted-foreground',
          )}
        />
      </span>
    </button>
  )
}
