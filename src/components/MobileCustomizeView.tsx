import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  AudioLines,
  Check,
  ChevronRight,
  Layers,
  Moon,
  Paintbrush,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  Type,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { ColorPicker } from '@/components/ColorPicker'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import {
  EaseThemeToggle,
  ThemeToggleGlyph,
  runThemeViewTransition,
} from '@/components/EaseThemeToggle'
import { NowPlayingVisualizer } from '@/components/NowPlayingVisualizer'
import { Loader2 } from '@/components/PulseBarsLoader'
import { Scrubber } from '@/components/Scrubber'
import { MotionSwitch, SlidingTabs } from '@/components/ui/motion'
import { VinylPlayButton, WaveformPlayButton } from '@/components/WaveformPlayButton'
import { ZunoIcon } from '@/components/ZunoIcon'
import {
  clearSavedCustomFontFile,
  MONO_FONT_PRESETS,
  registerCustomFontFile,
  sanitizeFontFamilyName,
  UI_FONT_PRESETS,
} from '@/lib/fonts'
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
  type PlayingStyleId,
  type RadiusStyleId,
  type ScrollProgressStyleId,
  type ScrollRevealStyleId,
  type ScrubberKnobStyleId,
  type SurfaceStyleId,
  type ThemeId,
  type ThemeMode,
  type ThemeToggleStyleId,
  type ThemeTransitionId,
  type ThemeTransitionStartId,
  type TrackIconStyleId,
  type VisualizerColorId,
  type VisualizerIntensityId,
  type VisualizerStyleId,
} from '@/lib/appearance'

type MobileSubPage =
  | null
  | 'colors'
  | 'fonts'
  | 'surfaces'
  | 'icons'
  | 'visualizer'
  | 'playback'
  | 'crossfade'
  | 'motion'

const MOBILE_SUBPAGE_TITLES: Record<Exclude<MobileSubPage, null>, string> = {
  colors: 'Colors & Palette',
  fonts: 'Typography & Fonts',
  surfaces: 'Surfaces & Layout',
  icons: 'Icon Pack',
  visualizer: 'Visualizer',
  playback: 'Playback & Scrubber',
  crossfade: 'Audio Crossfade',
  motion: 'Motion & Scroll',
}

const SHORT_THEME_LABELS: Record<ThemeId, string> = {
  zinc: 'Obsidian',
  oled: 'OLED',
  vermilion: 'Vermilion',
  stone: 'Terracotta',
  amber: 'Amber',
  crimson: 'Crimson',
  emerald: 'Emerald',
  slate: 'Slate',
}

const SECTION_TO_MOBILE_SUBPAGE: Record<string, MobileSubPage> = {
  themes: null,
  theme: null,
  theme_presets: null,
  colors: 'colors',
  palette: 'colors',
  custom_palette: 'colors',
  fonts: 'fonts',
  typography: 'fonts',
  typography_fonts: 'fonts',
  surfaces: 'surfaces',
  surface_materials: 'surfaces',
  background: 'surfaces',
  canvas_background: 'surfaces',
  layout: 'surfaces',
  layout_geometry: 'surfaces',
  icons: 'icons',
  icon_packs: 'icons',
  visualizer: 'visualizer',
  now_playing_visualizer: 'visualizer',
  playing_track: 'playback',
  scrubber: 'playback',
  play_button: 'playback',
  player_bar: 'playback',
  crossfade: 'crossfade',
  audio_crossfade: 'crossfade',
  scroll: 'motion',
  scroll_progress: 'motion',
  scroll_reveal: 'motion',
  theme_toggle: 'motion',
  theme_transitions: 'motion',
}

const CUSTOM_COLOR_SLOTS: {
  key: keyof CustomColorOverrides
  label: string
  hint: string
  presets: string[]
}[] = [
  {
    key: 'primary',
    label: 'Primary Accent',
    hint: 'Buttons, active indicators & scrubber',
    presets: ['#fafafa', '#ea5829', '#f59e0b', '#10b981', '#3b82f6', '#818cf8', '#e11d48'],
  },
  {
    key: 'background',
    label: 'Background',
    hint: 'Main screen canvas',
    presets: ['#000000', '#09090b', '#0e0c0a', '#0a0c14', '#ffffff', '#f7f5f0'],
  },
  {
    key: 'card',
    label: 'Cards & Dock',
    hint: 'Floating dock, menus & panels',
    presets: ['#0a0a0c', '#121215', '#181411', '#121624', '#f8f8f9', '#ffffff'],
  },
  {
    key: 'secondary',
    label: 'Active Surface',
    hint: 'Selected rows & pills',
    presets: ['#121216', '#18181b', '#211c17', '#181e30', '#f4f4f5', '#ede9e0'],
  },
  {
    key: 'border',
    label: 'Borders',
    hint: '1px dividers & card outlines',
    presets: ['#1e1e24', '#27272a', '#2e2721', '#242a40', '#e4e4e7', '#dfdad0'],
  },
  {
    key: 'foreground',
    label: 'Primary Text',
    hint: 'Song titles & headings',
    presets: ['#ffffff', '#fafafa', '#f8f4ef', '#f1f5f9', '#09090b', '#1c1917'],
  },
  {
    key: 'mutedForeground',
    label: 'Muted Text',
    hint: 'Artists & durations',
    presets: ['#8e8e97', '#a1a1aa', '#9d9287', '#8c96b0', '#71717a', '#64748b'],
  },
]

interface MobileCustomizeViewProps {
  settings: AppearanceSettings
  section?: string | null
  isModified: boolean
  onChange: (patch: Partial<AppearanceSettings>) => void
  onSelectTheme: (id: ThemeId, targetMode?: ThemeMode) => void
  onToggleMode: () => void
  onReset: () => void
  onBack: () => void
}

/**
 * Minimal, touch-first Mobile Customize view (< 1024px).
 * Excludes desktop-only window/titlebar/sidebar/zoom settings and groups every
 * mobile-applicable option into a clean OLED hub + focused drill-down screens.
 */
export function MobileCustomizeView({
  settings,
  section,
  isModified,
  onChange,
  onSelectTheme,
  onToggleMode,
  onReset,
  onBack,
}: MobileCustomizeViewProps) {
  const [subPage, setSubPage] = useState<MobileSubPage>(null)
  const [previewScrub, setPreviewScrub] = useState(42)
  const [previewPlaying, setPreviewPlaying] = useState(true)
  const [uiFontDraft, setUiFontDraft] = useState(settings.customUiFont || '')
  const [monoFontDraft, setMonoFontDraft] = useState(settings.customMonoFont || '')
  const [fontNotice, setFontNotice] = useState('')
  const uiFileRef = useRef<HTMLInputElement>(null)
  const monoFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUiFontDraft(settings.customUiFont || '')
  }, [settings.customUiFont])

  useEffect(() => {
    setMonoFontDraft(settings.customMonoFont || '')
  }, [settings.customMonoFont])

  useEffect(() => {
    if (!section) return
    const key = section.trim().toLowerCase()
    if (key in SECTION_TO_MOBILE_SUBPAGE) {
      setSubPage(SECTION_TO_MOBILE_SUBPAGE[key])
    }
  }, [section])

  const palette = useMemo(() => resolveEffectivePalette(settings), [settings])
  const customColorCount = Object.values(settings.customColors ?? {}).filter(Boolean).length
  const hasCustomColors = customColorCount > 0

  const activeAccentLabel =
    ACCENT_PRESETS.find((a) => a.id === settings.accent)?.label ?? 'Theme'
  const activeUiFontLabel =
    settings.customUiFont ||
    UI_FONT_PRESETS.find((f) => f.id === settings.fontFamily)?.label ||
    settings.fontFamily
  const activeIconPackLabel =
    ICON_PACK_OPTIONS.find((p) => p.id === settings.iconPack)?.label.replace(' Animated', '') ||
    settings.iconPack

  const surfaceLabels: Record<SurfaceStyleId, string> = {
    bordered: 'Bordered',
    flat: 'Matte',
    minimal_top: 'Hairline',
    borderless: 'Soft',
    glass: 'Glass',
    elevated: 'Elevated',
  }
  const vizLabels: Record<VisualizerStyleId, string> = {
    orb: 'Sound Orb',
    'wave-bars': 'Wave Bars',
    'fluid-wave': 'Waves',
    'radial-ring': 'Bass Ring',
    'aurora-pulse': 'Halo',
    none: 'Off',
  }
  const playingLabels: Record<PlayingStyleId, string> = {
    pulse: 'Pulse',
    equalizer: 'Equalizer',
    'pulse-bars': 'Bars',
    minimal: 'Minimal',
  }
  const scrubberLabels: Record<ScrubberKnobStyleId, string> = {
    ring: 'Ring',
    solid: 'Solid',
    line: 'Line',
    pill: 'Pill',
    capsule: 'Capsule',
    waveform: 'Wave',
    ticks: 'Ticks',
  }
  const revealLabels: Record<ScrollRevealStyleId, string> = {
    none: 'Instant',
    'slide-fade': 'Cascade',
    'blur-reveal': 'Blur Reveal',
  }

  const switchMode = (target: ThemeMode) => {
    if (target === settings.mode) return
    runThemeViewTransition(() => onChange({ mode: target }), {
      variant: settings.themeTransition,
      start: settings.themeTransitionStart,
    })
  }

  const updateCustomColor = (key: keyof CustomColorOverrides, hex: string) => {
    onChange({
      customColors: {
        ...(settings.customColors ?? {}),
        [key]: hex,
      },
    })
  }

  const applyCustomFont = (slot: 'ui' | 'mono', raw: string) => {
    const clean = sanitizeFontFamilyName(raw)
    if (slot === 'ui') {
      setUiFontDraft(clean)
      onChange({ customUiFont: clean })
    } else {
      setMonoFontDraft(clean)
      onChange({ customMonoFont: clean })
    }
    setFontNotice(clean ? `Applied ${clean}` : '')
  }

  const handleUploadFont = async (slot: 'ui' | 'mono', file: File | undefined) => {
    if (!file) return
    try {
      const family = await registerCustomFontFile(slot, file)
      applyCustomFont(slot, family)
      setFontNotice(`Loaded "${family}"`)
    } catch (err) {
      setFontNotice(err instanceof Error ? err.message : 'Could not load font')
    }
  }

  return (
    <div className="zuno-canvas flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden bg-background lg:hidden">
      {/* Minimal Safe-Area Top Header */}
      <header className="shrink-0 border-b border-border/70 bg-background/95 pt-[calc(var(--zuno-safe-top)+0.25rem)] backdrop-blur-sm">
        <div className="flex h-13 items-center justify-between gap-2 px-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => (subPage ? setSubPage(null) : onBack())}
              aria-label={subPage ? 'Back to Customize' : 'Close Customize'}
              className="t-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors active:bg-secondary cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                {subPage ? MOBILE_SUBPAGE_TITLES[subPage] : 'Customize'}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {isModified && (
              <button
                type="button"
                onClick={onReset}
                aria-label="Reset to defaults"
                className="t-press inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[11px] font-medium text-muted-foreground transition-colors active:bg-secondary cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
            <EaseThemeToggle
              mode={settings.mode}
              transition={settings.themeTransition}
              transitionStart={settings.themeTransitionStart}
              toggleStyle={settings.themeToggleStyle}
              onToggle={onToggleMode}
              size="sm"
            />
          </div>
        </div>
      </header>

      {/* Scrollable Mobile Content */}
      <CompactScrollArea
        className="min-h-0 min-w-0 flex-1"
        viewportClassName="px-4 pt-4 pb-[calc(3rem+var(--zuno-safe-bottom))]"
      >
        <div key={subPage ?? 'hub'} className="t-page-enter mx-auto w-full max-w-md space-y-5">
          {/* ═══════════════════ MAIN MINIMAL HUB ═══════════════════ */}
          {subPage === null && (
            <>
              {/* Hero Quick Theme & Accent Card */}
              <section className="z-surface-card space-y-3.5 rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">Theme</span>
                  <div className="inline-flex rounded-full border border-border bg-background p-0.5">
                    <button
                      type="button"
                      onClick={() => switchMode('dark')}
                      className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors cursor-pointer',
                        settings.mode === 'dark'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <Moon className="h-3 w-3" />
                      <span>Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('light')}
                      className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors cursor-pointer',
                        settings.mode === 'light'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <Sun className="h-3 w-3" />
                      <span>Light</span>
                    </button>
                  </div>
                </div>

                {/* Compact 4×2 Swatch Grid — all 8 themes visible at a glance */}
                <div
                  role="radiogroup"
                  aria-label="Color theme"
                  className="grid grid-cols-4 gap-2"
                >
                  {THEME_PRESETS.map((t) => {
                    const selected = settings.theme === t.id
                    const pal = settings.mode === 'light' ? t.light : t.dark
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onSelectTheme(t.id)}
                        className="flex min-w-0 flex-col items-center gap-1.5 text-center focus:outline-none cursor-pointer"
                      >
                        <div
                          className="relative flex aspect-[5/4] w-full flex-col justify-between overflow-hidden rounded-xl border p-1.5 transition-transform active:scale-95"
                          style={{
                            backgroundColor: pal.background,
                            borderColor: selected ? pal.primary : pal.border,
                            boxShadow: selected
                              ? `inset 0 0 0 1.5px ${pal.primary}`
                              : undefined,
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: pal.primary }}
                            />
                            {selected && (
                              <span
                                className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
                                style={{
                                  backgroundColor: pal.primary,
                                  color: pal.primaryForeground,
                                }}
                              >
                                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                              </span>
                            )}
                          </div>
                          <div
                            className="space-y-1 rounded-md p-1"
                            style={{ backgroundColor: pal.card }}
                          >
                            <span
                              className="block h-1 w-4/5 rounded-full opacity-80"
                              style={{ backgroundColor: pal.foreground }}
                            />
                            <span
                              className="block h-1 w-3/5 rounded-full"
                              style={{ backgroundColor: pal.primary }}
                            />
                          </div>
                        </div>
                        <span
                          className={cn(
                            'w-full truncate text-[10.5px] leading-tight',
                            selected
                              ? 'font-semibold text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {SHORT_THEME_LABELS[t.id]}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Quick Accent Dots */}
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">Accent</span>
                    <span className="font-mono text-[10.5px] text-foreground">
                      {settings.customColors?.primary ? 'Custom' : activeAccentLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5">
                    {ACCENT_PRESETS.map((acc) => {
                      const active =
                        !settings.customColors?.primary && settings.accent === acc.id
                      const dotColor =
                        acc.id === 'mono'
                          ? settings.mode === 'light'
                            ? '#18181b'
                            : '#fafafa'
                          : acc.swatch
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          aria-label={acc.label}
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
                            't-press flex h-8 w-8 items-center justify-center rounded-full border transition-all cursor-pointer',
                            active
                              ? 'border-primary ring-2 ring-primary/40 ring-offset-2 ring-offset-card'
                              : 'border-border/80',
                          )}
                          style={{ backgroundColor: dotColor }}
                        >
                          {active && (
                            <Check
                              className="h-3.5 w-3.5"
                              strokeWidth={3}
                              style={{
                                color:
                                  acc.id === 'mono' && settings.mode === 'dark'
                                    ? '#000000'
                                    : '#ffffff',
                              }}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>

              {/* Group 1: Look & Style */}
              <div className="space-y-2">
                <SectionCaption>Look &amp; Style</SectionCaption>
                <div className="z-surface-card divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                  <HubNavRow
                    icon={Paintbrush}
                    label="Colors & Palette"
                    value={hasCustomColors ? `${customColorCount} custom` : activeAccentLabel}
                    onClick={() => setSubPage('colors')}
                  />
                  <HubNavRow
                    icon={Type}
                    label="Typography & Fonts"
                    value={`${activeUiFontLabel} · ${settings.fontSize.toUpperCase()}`}
                    onClick={() => setSubPage('fonts')}
                  />
                  <HubNavRow
                    icon={Layers}
                    label="Surfaces & Layout"
                    value={`${surfaceLabels[settings.surfaceStyle]} · ${settings.density}`}
                    onClick={() => setSubPage('surfaces')}
                  />
                  <HubNavRow
                    icon={Sparkles}
                    label="Icon Pack"
                    value={activeIconPackLabel}
                    onClick={() => setSubPage('icons')}
                  />
                </div>
              </div>

              {/* Group 2: Player & Audio */}
              <div className="space-y-2">
                <SectionCaption>Player &amp; Audio</SectionCaption>
                <div className="z-surface-card divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                  <HubNavRow
                    icon={AudioLines}
                    label="Now Playing Visualizer"
                    value={vizLabels[settings.visualizerStyle]}
                    onClick={() => setSubPage('visualizer')}
                  />
                  <HubNavRow
                    icon={Play}
                    label="Playback & Scrubber"
                    value={`${playingLabels[settings.playingStyle]} · ${scrubberLabels[settings.scrubberKnob]}`}
                    onClick={() => setSubPage('playback')}
                  />
                  <HubNavRow
                    icon={Sliders}
                    label="Audio Crossfade"
                    value={
                      settings.crossfadeSecs > 0
                        ? `${settings.crossfadeSecs.toFixed(settings.crossfadeSecs % 1 === 0 ? 0 : 1)}s`
                        : 'Off'
                    }
                    onClick={() => setSubPage('crossfade')}
                  />
                </div>
              </div>

              {/* Group 3: Motion & Display */}
              <div className="space-y-2">
                <SectionCaption>Motion &amp; Display</SectionCaption>
                <div className="z-surface-card divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                  <HubNavRow
                    icon={Wand2}
                    label="Scroll & Transitions"
                    value={revealLabels[settings.scrollRevealStyle]}
                    onClick={() => setSubPage('motion')}
                  />
                  <MobileToggleRow
                    label="Bottom dock blur"
                    checked={settings.dockGradualBlur}
                    onChange={(dockGradualBlur) => onChange({ dockGradualBlur })}
                  />
                  <MobileToggleRow
                    label="Play button pulse"
                    checked={settings.showPlayPulse}
                    onChange={(showPlayPulse) => onChange({ showPlayPulse })}
                  />
                  <MobileToggleRow
                    label="Artist / folder overline"
                    checked={settings.showTrackOverline}
                    onChange={(showTrackOverline) => onChange({ showTrackOverline })}
                  />
                  <MobileToggleRow
                    label="Track duration"
                    checked={settings.showTrackDuration}
                    onChange={(showTrackDuration) => onChange({ showTrackDuration })}
                  />
                </div>
              </div>
            </>
          )}

          {/* ═══════════════════ SUB: COLORS & PALETTE ═══════════════════ */}
          {subPage === 'colors' && (
            <div className="space-y-4">
              {/* Compact 60/30/10 Ratio Bar */}
              <div className="flex h-7 w-full overflow-hidden rounded-xl border border-border font-mono text-[10px] font-medium">
                <div
                  className="flex w-[60%] items-center justify-center border-r border-border/70"
                  style={{ backgroundColor: palette.background, color: palette.foreground }}
                >
                  60% {palette.background}
                </div>
                <div
                  className="flex w-[30%] items-center justify-center border-r border-border/70"
                  style={{ backgroundColor: palette.secondary, color: palette.foreground }}
                >
                  30%
                </div>
                <div
                  className="flex w-[10%] items-center justify-center"
                  style={{ backgroundColor: palette.primary, color: palette.primaryForeground }}
                >
                  10%
                </div>
              </div>

              {(hasCustomColors || settings.accent !== 'mono') && (
                <button
                  type="button"
                  onClick={() => onChange({ accent: 'mono', customColors: {} })}
                  className="t-press inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground active:bg-secondary cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restore theme palette</span>
                </button>
              )}

              <div className="space-y-2">
                <SectionCaption>Accent Presets</SectionCaption>
                <div className="flex flex-wrap gap-1.5">
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
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <span
                          className="h-3 w-3 rounded-full border border-border"
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

              <div className="space-y-2.5">
                <SectionCaption>Fine-Tune Surface Tokens</SectionCaption>
                <div className="space-y-2.5">
                  {CUSTOM_COLOR_SLOTS.map((slot) => (
                    <div
                      key={slot.key}
                      className="relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 focus-within:z-30"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{slot.label}</span>
                        <span className="truncate text-[10.5px] text-muted-foreground">
                          {slot.hint}
                        </span>
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
              </div>
            </div>
          )}

          {/* ═══════════════════ SUB: TYPOGRAPHY & FONTS ═══════════════════ */}
          {subPage === 'fonts' && (
            <div className="space-y-4">
              {/* Compact Specimen */}
              <div className="rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    midnight_chords
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    01:42 / 03:32
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {activeUiFontLabel} · {settings.customMonoFont || settings.monoFont}
                </p>
              </div>

              <div className="space-y-2">
                <SectionCaption>Text Size</SectionCaption>
                <SlidingTabs<FontSizeId>
                  value={settings.fontSize}
                  onChange={(fontSize) => onChange({ fontSize })}
                  variant="card"
                  options={[
                    { value: 'sm', label: 'Small' },
                    { value: 'md', label: 'Default' },
                    { value: 'lg', label: 'Large' },
                  ]}
                />
              </div>

              {/* UI Font */}
              <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">Interface Font</span>
                  <button
                    type="button"
                    onClick={() => uiFileRef.current?.click()}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2 font-mono text-[10.5px] text-foreground cursor-pointer"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload</span>
                  </button>
                  <input
                    ref={uiFileRef}
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf"
                    className="hidden"
                    onChange={(e) => {
                      handleUploadFont('ui', e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {UI_FONT_PRESETS.map((preset) => {
                    const active = !settings.customUiFont && settings.fontFamily === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setUiFontDraft('')
                          onChange({ fontFamily: preset.id, customUiFont: '' })
                        }}
                        style={{ fontFamily: preset.stack }}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary font-medium text-foreground'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    value={uiFontDraft}
                    onChange={(e) => setUiFontDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyCustomFont('ui', uiFontDraft)
                    }}
                    placeholder="Custom font name…"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                  />
                  {uiFontDraft && (
                    <button
                      type="button"
                      onClick={() => applyCustomFont('ui', '')}
                      aria-label="Clear custom UI font"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => applyCustomFont('ui', uiFontDraft)}
                    className="h-7 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Mono Font */}
              <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Timestamps &amp; Mono
                  </span>
                  <button
                    type="button"
                    onClick={() => monoFileRef.current?.click()}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2 font-mono text-[10.5px] text-foreground cursor-pointer"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload</span>
                  </button>
                  <input
                    ref={monoFileRef}
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf"
                    className="hidden"
                    onChange={(e) => {
                      handleUploadFont('mono', e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MONO_FONT_PRESETS.map((preset) => {
                    const active = !settings.customMonoFont && settings.monoFont === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setMonoFontDraft('')
                          onChange({ monoFont: preset.id, customMonoFont: '' })
                        }}
                        style={{ fontFamily: preset.stack }}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary font-medium text-foreground'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    value={monoFontDraft}
                    onChange={(e) => setMonoFontDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyCustomFont('mono', monoFontDraft)
                    }}
                    placeholder="Custom mono font…"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                  />
                  {monoFontDraft && (
                    <button
                      type="button"
                      onClick={() => applyCustomFont('mono', '')}
                      aria-label="Clear custom mono font"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => applyCustomFont('mono', monoFontDraft)}
                    className="h-7 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                {fontNotice ? (
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {fontNotice}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearSavedCustomFontFile('ui')
                    clearSavedCustomFontFile('mono')
                    setUiFontDraft('')
                    setMonoFontDraft('')
                    setFontNotice('')
                    onChange({
                      fontFamily: DEFAULT_APPEARANCE.fontFamily,
                      monoFont: DEFAULT_APPEARANCE.monoFont,
                      customUiFont: '',
                      customMonoFont: '',
                    })
                  }}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Default Fonts</span>
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════ SUB: SURFACES & LAYOUT ═══════════════════ */}
          {subPage === 'surfaces' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <SectionCaption>Surface Finish</SectionCaption>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'bordered', label: 'Framed' },
                      { id: 'flat', label: 'Flat Matte' },
                      { id: 'minimal_top', label: 'Hairline' },
                      { id: 'borderless', label: 'Borderless' },
                      { id: 'glass', label: 'Glass' },
                      { id: 'elevated', label: 'Elevated' },
                    ] as { id: SurfaceStyleId; label: string }[]
                  ).map((opt) => {
                    const active = settings.surfaceStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ surfaceStyle: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Borders</SectionCaption>
                <SlidingTabs<BorderStyleId>
                  value={settings.borders}
                  onChange={(borders) => onChange({ borders })}
                  variant="card"
                  options={[
                    { value: 'borderless', label: 'None' },
                    { value: 'subtle', label: 'Subtle' },
                    { value: 'crisp', label: 'Crisp' },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <SectionCaption>Canvas Texture</SectionCaption>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'clean', label: 'Clean' },
                      { id: 'dot_grid', label: 'Dots' },
                      { id: 'fine_grid', label: 'Grid' },
                      { id: 'top_glow', label: 'Glow' },
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
                          'flex flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card',
                        )}
                      >
                        <div
                          data-bg-pattern={opt.id}
                          className="h-9 w-full overflow-hidden rounded-lg border border-border bg-background"
                        >
                          <div className="zuno-canvas h-full w-full" />
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-[11px] font-medium text-foreground">
                            {opt.label}
                          </span>
                          {active && <Check className="h-3 w-3 shrink-0 text-primary" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Row Corners</SectionCaption>
                <SlidingTabs<RadiusStyleId>
                  value={settings.radius}
                  onChange={(radius) => onChange({ radius })}
                  variant="card"
                  options={[
                    { value: 'sharp', label: 'Sharp' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'round', label: 'Round' },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <SectionCaption>List Density</SectionCaption>
                <SlidingTabs<DensityId>
                  value={settings.density}
                  onChange={(density) => onChange({ density })}
                  variant="card"
                  options={[
                    { value: 'compact', label: 'Compact' },
                    { value: 'comfortable', label: 'Default' },
                    { value: 'spacious', label: 'Spacious' },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ═══════════════════ SUB: ICON PACK ═══════════════════ */}
          {subPage === 'icons' && (
            <div className="space-y-4">
              <div className="flex items-center justify-around rounded-2xl border border-border bg-card px-2 py-3 text-foreground">
                {(['music', 'play', 'heart', 'search', 'equalizer', 'radio'] as const).map(
                  (name) => (
                    <span
                      key={name}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/70"
                    >
                      <ZunoIcon name={name} pack={settings.iconPack} className="h-4 w-4" />
                    </span>
                  ),
                )}
              </div>

              <div className="space-y-2">
                <SectionCaption>Icon Pack</SectionCaption>
                <div className="grid grid-cols-2 gap-2">
                  {ICON_PACK_OPTIONS.map((pack) => {
                    const active = settings.iconPack === pack.id
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => onChange({ iconPack: pack.id })}
                        className={cn(
                          'flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card',
                        )}
                      >
                        <div className="flex items-center justify-between text-foreground">
                          <div className="flex items-center gap-1.5">
                            <ZunoIcon name="music" pack={pack.id} className="h-3.5 w-3.5" />
                            <ZunoIcon name="play" pack={pack.id} className="h-3.5 w-3.5" />
                            <ZunoIcon name="heart" pack={pack.id} className="h-3.5 w-3.5" />
                          </div>
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <span className="truncate text-xs font-medium text-foreground">
                          {pack.label.replace(' Animated', '')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Stroke Weight</SectionCaption>
                <SlidingTabs<IconStrokeId>
                  value={settings.iconStroke}
                  onChange={(iconStroke) => onChange({ iconStroke })}
                  variant="card"
                  options={[
                    { value: 'thin', label: 'Thin' },
                    { value: 'regular', label: 'Regular' },
                    { value: 'bold', label: 'Bold' },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ═══════════════════ SUB: VISUALIZER ═══════════════════ */}
          {subPage === 'visualizer' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setPreviewPlaying((p) => !p)}
                className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-card cursor-pointer"
              >
                {settings.visualizerStyle === 'none' ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    Visualizer Off · Text Only
                  </span>
                ) : (
                  <NowPlayingVisualizer
                    styleVariant={settings.visualizerStyle}
                    colorMode={settings.visualizerColor}
                    intensity={settings.visualizerIntensity}
                    mode={settings.mode}
                    isPlaying={previewPlaying}
                    demo
                    className="h-full w-full"
                  />
                )}
                <span className="pointer-events-none absolute right-2.5 bottom-2 rounded-full border border-border/70 bg-background/80 px-2 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                  {previewPlaying ? 'Tap to pause' : 'Paused'}
                </span>
              </button>

              <div className="space-y-2">
                <SectionCaption>Style</SectionCaption>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'wave-bars', label: 'Wave Bars' },
                      { id: 'orb', label: 'Sound Orb' },
                      { id: 'fluid-wave', label: 'Harmonic Waves' },
                      { id: 'radial-ring', label: 'Bass Ring' },
                      { id: 'aurora-pulse', label: 'Ambient Halo' },
                      { id: 'none', label: 'Off' },
                    ] as { id: VisualizerStyleId; label: string }[]
                  ).map((opt) => {
                    const active = settings.visualizerStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ visualizerStyle: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Color Mode</SectionCaption>
                <SlidingTabs<VisualizerColorId>
                  value={settings.visualizerColor}
                  onChange={(visualizerColor) => onChange({ visualizerColor })}
                  variant="card"
                  options={[
                    { value: 'theme', label: 'Theme' },
                    { value: 'spectrum', label: 'Spectrum' },
                    { value: 'mono', label: 'Mono' },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <SectionCaption>Bass Reactivity</SectionCaption>
                <SlidingTabs<VisualizerIntensityId>
                  value={settings.visualizerIntensity}
                  onChange={(visualizerIntensity) => onChange({ visualizerIntensity })}
                  variant="card"
                  options={[
                    { value: 'subtle', label: 'Subtle' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'dynamic', label: 'Dynamic' },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ═══════════════════ SUB: PLAYBACK & SCRUBBER ═══════════════════ */}
          {subPage === 'playback' && (
            <div className="space-y-5">
              {/* Active Track Row Style */}
              <div className="space-y-2">
                <SectionCaption>Active Song Row</SectionCaption>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'equalizer', label: 'Equalizer Bars' },
                      { id: 'pulse', label: 'Pulse Ring' },
                      { id: 'pulse-bars', label: 'Pulse Bars' },
                      { id: 'minimal', label: 'Minimal' },
                    ] as { id: PlayingStyleId; label: string }[]
                  ).map((opt) => {
                    const active = settings.playingStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ playingStyle: opt.id })}
                        className={cn(
                          'flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card',
                        )}
                      >
                        <div className="flex h-7 items-center justify-between">
                          {opt.id === 'equalizer' ? (
                            <span className="flex h-4 items-end gap-[2px]">
                              <span className="zuno-eq-bar" />
                              <span className="zuno-eq-bar" />
                              <span className="zuno-eq-bar" />
                              <span className="zuno-eq-bar" />
                            </span>
                          ) : opt.id === 'pulse-bars' ? (
                            <Loader2 barCount={4} height={14} width={2} gap={2} speed={0.95} />
                          ) : opt.id === 'pulse' ? (
                            <span className="relative flex h-5 w-5 items-center justify-center">
                              <span className="animate-btn-pulse absolute inset-0 rounded-full border border-primary" />
                              <span className="h-3.5 w-3.5 rounded-full bg-primary" />
                            </span>
                          ) : (
                            <ZunoIcon
                              name="pause"
                              pack={settings.iconPack}
                              filled
                              className="h-3.5 w-3.5 text-primary"
                            />
                          )}
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <span className="truncate text-xs font-medium text-foreground">
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Idle Track Indicator</SectionCaption>
                <SlidingTabs<TrackIconStyleId>
                  value={settings.trackIconStyle}
                  onChange={(trackIconStyle) => onChange({ trackIconStyle })}
                  variant="card"
                  options={[
                    { value: 'ring', label: 'Ring' },
                    { value: 'filled', label: 'Filled' },
                    { value: 'minimal', label: 'Minimal' },
                    { value: 'number', label: 'Number' },
                  ]}
                />
              </div>

              {/* Progress Scrubber */}
              <div className="space-y-2.5">
                <SectionCaption>Progress Scrubber</SectionCaption>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    00:{String(Math.round(previewScrub * 0.6)).padStart(2, '0')}
                  </span>
                  <Scrubber
                    value={previewScrub}
                    max={100}
                    styleVariant={settings.scrubberKnob}
                    seed="mobile-scrubber-preview"
                    onChange={setPreviewScrub}
                    className="flex-1"
                  />
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    01:00
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'solid', label: 'Solid Dot' },
                      { id: 'ring', label: 'Hollow Ring' },
                      { id: 'line', label: 'Minimal Line' },
                      { id: 'pill', label: 'Vertical Pill' },
                      { id: 'capsule', label: 'Capsule Bar' },
                      { id: 'waveform', label: 'Waveform' },
                      { id: 'ticks', label: 'Ticks' },
                    ] as { id: ScrubberKnobStyleId; label: string }[]
                  ).map((opt) => {
                    const active = settings.scrubberKnob === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ scrubberKnob: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Play Button Style */}
              <div className="space-y-2">
                <SectionCaption>Play Button</SectionCaption>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'classic', label: 'Classic' },
                      { id: 'waveform', label: 'Wave' },
                      { id: 'vinyl', label: 'Vinyl' },
                    ] as { id: PlayButtonStyleId; label: string }[]
                  ).map((opt) => {
                    const active = settings.playButtonStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ playButtonStyle: opt.id })}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card',
                        )}
                      >
                        {opt.id === 'waveform' ? (
                          <span className="pointer-events-none">
                            <WaveformPlayButton isPlaying onClick={() => {}} size="sm" />
                          </span>
                        ) : opt.id === 'vinyl' ? (
                          <span className="pointer-events-none">
                            <VinylPlayButton isPlaying onClick={() => {}} size="sm" />
                          </span>
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <ZunoIcon
                              name="play"
                              pack={settings.iconPack}
                              filled
                              className="h-3.5 w-3.5 translate-x-[0.5px]"
                            />
                          </span>
                        )}
                        <span className="text-[11.5px] font-medium text-foreground">
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════ SUB: AUDIO CROSSFADE ═══════════════════ */}
          {subPage === 'crossfade' && (
            <div className="space-y-4">
              <div className="z-surface-card space-y-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Equal-Power Crossfade
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {settings.crossfadeSecs > 0
                        ? `Smooth ${settings.crossfadeSecs.toFixed(settings.crossfadeSecs % 1 === 0 ? 0 : 1)}s transition between songs`
                        : 'Instant track switching'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs font-semibold tabular-nums text-foreground">
                    {settings.crossfadeSecs > 0
                      ? `${settings.crossfadeSecs.toFixed(settings.crossfadeSecs % 1 === 0 ? 0 : 1)}s`
                      : 'Off'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2, 3, 5, 8].map((sec) => {
                    const active = Math.abs(settings.crossfadeSecs - sec) < 0.05
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onChange({ crossfadeSecs: sec })}
                        className={cn(
                          'h-9 rounded-xl border font-mono text-xs font-medium tabular-nums transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground',
                        )}
                      >
                        {sec === 0 ? 'Off' : `${sec}s`}
                      </button>
                    )
                  })}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="font-mono text-[10.5px] text-muted-foreground">0s</span>
                  <input
                    type="range"
                    aria-label="Audio crossfade duration"
                    min={0}
                    max={10}
                    step={0.5}
                    value={settings.crossfadeSecs}
                    onChange={(e) => onChange({ crossfadeSecs: Number(e.target.value) })}
                    className="h-1.5 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="font-mono text-[10.5px] text-muted-foreground">10s</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════ SUB: MOTION & SCROLL ═══════════════════ */}
          {subPage === 'motion' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <SectionCaption>Scroll Row Reveal</SectionCaption>
                <SlidingTabs<ScrollRevealStyleId>
                  value={settings.scrollRevealStyle}
                  onChange={(scrollRevealStyle) => onChange({ scrollRevealStyle })}
                  variant="card"
                  options={[
                    { value: 'none', label: 'Off' },
                    { value: 'slide-fade', label: 'Cascade' },
                    { value: 'blur-reveal', label: 'Blur Reveal' },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <SectionCaption>Scroll Progress Indicator</SectionCaption>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'none', label: 'None' },
                      { id: 'skiper89', label: 'Ring Pill' },
                      { id: 'skiper94', label: 'Vertical Rail' },
                      { id: 'skiper95', label: 'Top Hairline' },
                    ] as { id: ScrollProgressStyleId; label: string }[]
                  ).map((opt) => {
                    const active = settings.scrollProgressStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ scrollProgressStyle: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Theme Toggle Icon</SectionCaption>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'eclipse', label: 'Eclipse' },
                      { id: 'smoothui', label: 'Kinetic' },
                      { id: 'skiper-1', label: 'Split Disc' },
                      { id: 'skiper-2', label: 'Horizon' },
                      { id: 'skiper-3', label: 'Expand Dot' },
                      { id: 'skiper-4', label: 'Orbital' },
                      { id: 'skiper-5', label: 'Switch Pill' },
                    ] as { id: ThemeToggleStyleId; label: string }[]
                  ).map((opt) => {
                    const active = settings.themeToggleStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ themeToggleStyle: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <span className="truncate text-xs font-medium">{opt.label}</span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground">
                          <ThemeToggleGlyph
                            style={opt.id}
                            isDark={settings.mode === 'dark'}
                            maskId={`mob-toggle-${opt.id}`}
                            className="h-3.5 w-3.5"
                          />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Theme Transition</SectionCaption>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'circle-blur', label: 'Circle Blur' },
                      { id: 'circle', label: 'Circle Wipe' },
                      { id: 'blur-fade', label: 'Blur Fade' },
                      { id: 'swipe', label: 'Swipe' },
                      { id: 'polygon', label: 'Polygon' },
                      { id: 'bottom-up', label: 'Curtain' },
                      { id: 'rectangle', label: 'Sweep' },
                      { id: 'blinds', label: 'Blinds' },
                    ] as { id: ThemeTransitionId; label: string }[]
                  ).map((opt) => {
                    const active = settings.themeTransition === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ themeTransition: opt.id })}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary text-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <SectionCaption>Transition Origin</SectionCaption>
                <SlidingTabs<ThemeTransitionStartId>
                  value={settings.themeTransitionStart}
                  onChange={(themeTransitionStart) => onChange({ themeTransitionStart })}
                  variant="card"
                  wrap
                  options={[
                    { value: 'trigger', label: 'Button' },
                    { value: 'center', label: 'Center' },
                    { value: 'top-left', label: 'Top L' },
                    { value: 'top-right', label: 'Top R' },
                    { value: 'bottom-left', label: 'Bot L' },
                    { value: 'bottom-right', label: 'Bot R' },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      </CompactScrollArea>
    </div>
  )
}

function SectionCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
      {children}
    </p>
  )
}

function HubNavRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof Paintbrush
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors active:bg-secondary/60 cursor-pointer"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/80 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <span className="max-w-[125px] truncate font-mono text-[11px]">{value}</span>
        <ChevronRight className="h-3.5 w-3.5 opacity-60" />
      </span>
    </button>
  )
}

function MobileToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors active:bg-secondary/50 cursor-pointer"
    >
      <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
      <MotionSwitch checked={checked} interactive={false} size="sm" />
    </button>
  )
}
