import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppWindow,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Box,
  Check,
  Compass,
  Contrast,
  Disc3,
  Eye,
  Frame,
  Layers,
  LayoutGrid,
  Maximize2,
  Minus,
  Music2,
  Paintbrush,
  Palette,
  PanelTop,
  Play,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Type,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { ColorPicker } from '@/components/ColorPicker'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { CustomFontStudio } from '@/components/CustomFontStudio'
import { MobileCustomizeView } from '@/components/MobileCustomizeView'
import {
  EaseThemeToggle,
  ThemeToggleGlyph,
  runThemeViewTransition,
} from '@/components/EaseThemeToggle'
import { Loader2 } from '@/components/PulseBarsLoader'
import { Scrubber } from '@/components/Scrubber'
import { ScrollProgressOverlay } from '@/components/ScrollProgressOverlay'
import {
  AudioCrossfadeLivePreview,
  CanvasPatternPreview,
  DesktopNavPreview,
  LayoutGeometryPreview,
  LivePreviewStage,
  PaletteBalancePreview,
  PlayButtonLivePreview,
  PlayerBarAndRowsPreview,
  PlayingTrackLivePreview,
  ScrollProgressLivePreview,
  ScrollRevealLivePreview,
  SurfaceMaterialPreview,
  ThemePresetPreview,
  ThemeToggleLivePreview,
  ThemeTransitionLivePreview,
  TypographyPreview,
  VisualizerLivePreview,
  WindowCornersPreview,
} from '@/components/StudioPreviews'
import { ThemeSelector } from '@/components/ThemeSelector'
import {
  AccordionChevron,
  AccordionPanel,
  MotionSwitch,
  SlidingTabs,
} from '@/components/ui/motion'
import { Tooltip } from '@/components/ui/tooltip'
import { VinylPlayButton, WaveformPlayButton } from '@/components/WaveformPlayButton'
import { WindowTitlebar } from '@/components/WindowTitlebar'
import { ZunoIcon } from '@/components/ZunoIcon'
import { cn } from '@/lib/utils'
import {
  ACCENT_PRESETS,
  clampUiZoom,
  DEFAULT_APPEARANCE,
  ICON_PACK_OPTIONS,
  resolveEffectivePalette,
  THEME_PRESETS,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  UI_ZOOM_PRESETS,
  UI_ZOOM_STEP,
  windowRadiusClass,
  type AppearanceSettings,
  type BgPatternId,
  type BorderStyleId,
  type CustomColorOverrides,
  type DensityId,
  type FontSizeId,
  type IconStrokeId,
  type NavStyleId,
  type PlayButtonStyleId,
  type PlayerBarStyleId,
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
  type TitlebarAlignId,
  type TitlebarStyleId,
  type TrackIconStyleId,
  type VisualizerColorId,
  type VisualizerIntensityId,
  type VisualizerStyleId,
  type WindowRadiusId,
} from '@/lib/appearance'

type StudioCategoryId =
  | 'color_themes_fonts'
  | 'window_chrome_nav'
  | 'surfaces_scroll_motion'
  | 'music_components'

type StudioPageId =
  | 'theme_presets'
  | 'custom_palette'
  | 'typography_fonts'
  | 'window_corners'
  | 'top_titlebar'
  | 'desktop_nav'
  | 'display_zoom'
  | 'surface_materials'
  | 'canvas_background'
  | 'scroll_progress'
  | 'scroll_reveal'
  | 'theme_toggle'
  | 'theme_transitions'
  | 'layout_geometry'
  | 'playing_track'
  | 'now_playing_visualizer'
  | 'scrubber'
  | 'play_button'
  | 'player_bar'
  | 'audio_crossfade'
  | 'icon_packs'

interface StudioComponentNode {
  id: StudioPageId
  categoryId: StudioCategoryId
  label: string
  description: string
  keywords: string
  icon: typeof Palette
}

interface StudioCategoryBranch {
  id: StudioCategoryId
  label: string
  shortLabel: string
  icon: typeof Palette
  children: StudioComponentNode[]
}

const STUDIO_TREE: StudioCategoryBranch[] = [
  {
    id: 'color_themes_fonts',
    label: 'Themes & Fonts',
    shortLabel: 'Themes',
    icon: Palette,
    children: [
      {
        id: 'theme_presets',
        categoryId: 'color_themes_fonts',
        label: 'Themes',
        description: 'Dark and light theme palettes.',
        keywords: 'theme dark light oled vermilion obsidian terracotta amber crimson emerald slate',
        icon: Sparkles,
      },
      {
        id: 'custom_palette',
        categoryId: 'color_themes_fonts',
        label: 'Colors',
        description: 'Accent and surface colors.',
        keywords: 'color palette hex accent hsv picker background secondary card border text',
        icon: Paintbrush,
      },
      {
        id: 'typography_fonts',
        categoryId: 'color_themes_fonts',
        label: 'Fonts',
        description: 'UI fonts, mono fonts, and text size.',
        keywords: 'font typography mono obel geist jetbrains upload woff2 ttf text size scale',
        icon: Type,
      },
    ],
  },
  {
    id: 'window_chrome_nav',
    label: 'Window & Nav',
    shortLabel: 'Window',
    icon: AppWindow,
    children: [
      {
        id: 'window_corners',
        categoryId: 'window_chrome_nav',
        label: 'Window Corners',
        description: 'Outer window corner radius.',
        keywords: 'rounded corners curve window border radius frameless transparent pill sharp',
        icon: Maximize2,
      },
      {
        id: 'top_titlebar',
        categoryId: 'window_chrome_nav',
        label: 'Titlebar',
        description: 'Window controls and top bar.',
        keywords: 'titlebar top bar close minimize maximize restore macos traffic lights pill compact',
        icon: PanelTop,
      },
      {
        id: 'desktop_nav',
        categoryId: 'window_chrome_nav',
        label: 'Navigation',
        description: 'Sidebar or floating navigation.',
        keywords: 'navigation sidebar floating navbar dock menu capsule smoothui great-ui pill',
        icon: Compass,
      },
      {
        id: 'display_zoom',
        categoryId: 'window_chrome_nav',
        label: 'Zoom',
        description: 'Interface scale (50% – 200%).',
        keywords: 'zoom scale magnify shrink size chrome 100 110 125 90 80 75 150 200 layout dpi',
        icon: ZoomIn,
      },
    ],
  },
  {
    id: 'surfaces_scroll_motion',
    label: 'Surfaces & Motion',
    shortLabel: 'Motion',
    icon: Layers,
    children: [
      {
        id: 'surface_materials',
        categoryId: 'surfaces_scroll_motion',
        label: 'Surfaces',
        description: 'Card finish and borders.',
        keywords: 'surface material bordered flat matte hairline borderless glass elevated borders dividers',
        icon: Layers,
      },
      {
        id: 'canvas_background',
        categoryId: 'surfaces_scroll_motion',
        label: 'Background',
        description: 'Subtle canvas textures.',
        keywords: 'background pattern texture clean dot grid fine grid top glow vignette canvas',
        icon: LayoutGrid,
      },
      {
        id: 'scroll_progress',
        categoryId: 'surfaces_scroll_motion',
        label: 'Scroll Progress',
        description: 'Scroll indicator style.',
        keywords: 'scroll progress skiper89 skiper94 skiper95 ring pill vertical rail top hairline gauge',
        icon: ArrowDownUp,
      },
      {
        id: 'scroll_reveal',
        categoryId: 'surfaces_scroll_motion',
        label: 'Row Reveal',
        description: 'Row scroll entrance effect.',
        keywords: 'scroll reveal blur-scroll-reveal great-ui cascade slide fade entrance animation rows',
        icon: Eye,
      },
      {
        id: 'theme_toggle',
        categoryId: 'surfaces_scroll_motion',
        label: 'Theme Toggle',
        description: 'Dark / light button style.',
        keywords: 'theme toggle button smoothui skiper4 eclipse split disc horizon sun orbital switch pill',
        icon: Contrast,
      },
      {
        id: 'theme_transitions',
        categoryId: 'surfaces_scroll_motion',
        label: 'Transitions',
        description: 'Mode switch animation.',
        keywords: 'transition view dark light circle blur fade swipe polygon curtain blinds origin skiper26 great-ui',
        icon: Wand2,
      },
      {
        id: 'layout_geometry',
        categoryId: 'surfaces_scroll_motion',
        label: 'Layout',
        description: 'Zoom, radius, and density.',
        keywords: 'layout geometry zoom scale 100 110 corner radius sharp balanced round density compact comfortable spacious',
        icon: Box,
      },
    ],
  },
  {
    id: 'music_components',
    label: 'Music',
    shortLabel: 'Music',
    icon: Music2,
    children: [
      {
        id: 'playing_track',
        categoryId: 'music_components',
        label: 'Active Track',
        description: 'Playing row indicator.',
        keywords: 'playing active song equalizer pulse ring pulse bars loader minimal leading icon number',
        icon: Play,
      },
      {
        id: 'now_playing_visualizer',
        categoryId: 'music_components',
        label: 'Visualizer',
        description: 'Now Playing audio visuals.',
        keywords: 'visualizer now playing orb wave bars harmonic sine radial bass ring aurora halo sound spectrum animation fft',
        icon: Sparkles,
      },
      {
        id: 'scrubber',
        categoryId: 'music_components',
        label: 'Scrubber',
        description: 'Progress bar style.',
        keywords: 'scrubber progress seek bar waveform ticks capsule pill ring solid line',
        icon: Sliders,
      },
      {
        id: 'play_button',
        categoryId: 'music_components',
        label: 'Play Button',
        description: 'Play / pause button style.',
        keywords: 'play button pause skiper25 waveform spinning vinyl disc classic toggle',
        icon: Disc3,
      },
      {
        id: 'player_bar',
        categoryId: 'music_components',
        label: 'Player Bar',
        description: 'Bar layout and row details.',
        keywords: 'player bar floating docked gradual blur gradualblur react-bits dock visibility pulse overline artist duration metadata',
        icon: RectangleHorizontal,
      },
      {
        id: 'audio_crossfade',
        categoryId: 'music_components',
        label: 'Crossfade',
        description: 'Track transition fade.',
        keywords: 'crossfade fade in fade out audio transition gapless overlap dj smooth',
        icon: AudioLines,
      },
      {
        id: 'icon_packs',
        categoryId: 'music_components',
        label: 'Icons',
        description: 'Icon style and stroke.',
        keywords: 'icons lucide skiper99 tabler iconsax hugeicons itshover pulsoicon humbleicons majesticons stroke weight',
        icon: Frame,
      },
    ],
  },
]

const ALL_STUDIO_PAGES: StudioComponentNode[] = STUDIO_TREE.flatMap((b) => b.children)

interface CustomColorSlot {
  key: keyof CustomColorOverrides
  label: string
  hint: string
  presets: string[]
}

const CUSTOM_COLOR_SLOTS: CustomColorSlot[] = [
  {
    key: 'primary',
    label: 'Accent',
    hint: 'Buttons & scrubber',
    presets: ['#fafafa', '#ea5829', '#f59e0b', '#10b981', '#3b82f6', '#818cf8', '#e11d48'],
  },
  {
    key: 'background',
    label: 'Background',
    hint: 'Main canvas',
    presets: ['#09090b', '#000000', '#0e0c0a', '#0a0c14', '#ffffff', '#f7f5f0'],
  },
  {
    key: 'secondary',
    label: 'Surface',
    hint: 'Active rows & pills',
    presets: ['#18181b', '#121216', '#211c17', '#181e30', '#f4f4f5', '#ede9e0'],
  },
  {
    key: 'card',
    label: 'Cards',
    hint: 'Sidebar & dock',
    presets: ['#121215', '#0a0a0c', '#181411', '#121624', '#f8f8f9', '#ffffff'],
  },
  {
    key: 'border',
    label: 'Borders',
    hint: 'Dividers',
    presets: ['#27272a', '#1e1e24', '#2e2721', '#242a40', '#e4e4e7', '#dfdad0'],
  },
  {
    key: 'foreground',
    label: 'Text',
    hint: 'Titles & labels',
    presets: ['#fafafa', '#ffffff', '#f8f4ef', '#f1f5f9', '#09090b', '#1c1917'],
  },
  {
    key: 'mutedForeground',
    label: 'Muted',
    hint: 'Artists & time',
    presets: ['#a1a1aa', '#8e8e97', '#9d9287', '#8c96b0', '#71717a', '#64748b'],
  },
]

const WINDOW_CORNER_PREVIEW_CLASS: Record<WindowRadiusId, string> = {
  sharp: 'rounded-tr-none',
  soft: 'rounded-tr-[10px]',
  curved: 'rounded-tr-[16px]',
  pill: 'rounded-tr-[22px]',
}

function isAppearanceModified(settings: AppearanceSettings): boolean {
  const keys = Object.keys(DEFAULT_APPEARANCE) as Array<keyof AppearanceSettings>
  for (const key of keys) {
    if (key === 'customColors') {
      const cur = settings.customColors ?? {}
      const def = DEFAULT_APPEARANCE.customColors ?? {}
      const colorKeys = new Set([
        ...(Object.keys(cur) as Array<keyof CustomColorOverrides>),
        ...(Object.keys(def) as Array<keyof CustomColorOverrides>),
      ])
      for (const ck of colorKeys) {
        if ((cur[ck] || undefined) !== (def[ck] || undefined)) return true
      }
    } else if (settings[key] !== DEFAULT_APPEARANCE[key]) {
      return true
    }
  }
  return false
}

const SECTION_ALIASES: Record<string, StudioPageId> = {
  themes: 'theme_presets',
  theme: 'theme_presets',
  colors: 'custom_palette',
  palette: 'custom_palette',
  fonts: 'typography_fonts',
  typography: 'typography_fonts',
  window_radius: 'window_corners',
  corners: 'window_corners',
  titlebar: 'top_titlebar',
  navigation: 'desktop_nav',
  nav: 'desktop_nav',
  zoom: 'display_zoom',
  surfaces: 'surface_materials',
  background: 'canvas_background',
  scroll: 'scroll_progress',
  layout: 'layout_geometry',
  visualizer: 'now_playing_visualizer',
  crossfade: 'audio_crossfade',
  icons: 'icon_packs',
}

interface CustomizePageProps {
  settings: AppearanceSettings
  section?: string | null
  onChange: (patch: Partial<AppearanceSettings>) => void
  onReset: () => void
  onBack: () => void
}

/**
 * Full-Screen Appearance & Audio Studio tailored for Zuno:
 * Collapsible hierarchical component tree sidebar + dedicated interactive Live Preview Stage & options per component.
 */
export function CustomizePage({
  settings,
  section,
  onChange,
  onReset,
  onBack,
}: CustomizePageProps) {
  const [activePage, setActivePage] = useState<StudioPageId>('theme_presets')
  const [expanded, setExpanded] = useState<Record<StudioCategoryId, boolean>>({
    color_themes_fonts: true,
    window_chrome_nav: true,
    surfaces_scroll_motion: true,
    music_components: true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [previewScrub, setPreviewScrub] = useState(42)
  const [previewPlaying, setPreviewPlaying] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!section) return
    const key = section.trim().toLowerCase()
    const resolved =
      SECTION_ALIASES[key] ??
      (ALL_STUDIO_PAGES.find((p) => p.id === key)?.id as StudioPageId | undefined)
    if (resolved) {
      setActivePage(resolved)
      const node = ALL_STUDIO_PAGES.find((p) => p.id === resolved)
      if (node) {
        setExpanded((prev) =>
          prev[node.categoryId] ? prev : { ...prev, [node.categoryId]: true },
        )
      }
    }
  }, [section])

  const currentIdx = ALL_STUDIO_PAGES.findIndex((p) => p.id === activePage)
  const currentMeta = ALL_STUDIO_PAGES[currentIdx] ?? ALL_STUDIO_PAGES[0]
  const currentCategory =
    STUDIO_TREE.find((b) => b.id === currentMeta.categoryId) ?? STUDIO_TREE[0]
  const palette = useMemo(() => resolveEffectivePalette(settings), [settings])

  const isModified = useMemo(() => isAppearanceModified(settings), [settings])
  const hasCustomColors = Object.values(settings.customColors ?? {}).some(Boolean)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (e.key === 'Escape' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        onBack()
        return
      }
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        tag !== 'INPUT' &&
        tag !== 'TEXTAREA'
      ) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBack])

  const filteredTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return STUDIO_TREE
    return STUDIO_TREE.map((branch) => {
      const branchHit = branch.label.toLowerCase().includes(q)
      const matchingChildren = branchHit
        ? branch.children
        : branch.children.filter((c) =>
            `${c.label} ${c.description} ${c.keywords}`.toLowerCase().includes(q),
          )
      return { ...branch, children: matchingChildren }
    }).filter((b) => b.children.length > 0)
  }, [searchQuery])

  const firstFilteredPage = filteredTree[0]?.children[0]

  const selectPage = (id: StudioPageId) => {
    const node = ALL_STUDIO_PAGES.find((p) => p.id === id)
    setActivePage(id)
    if (node) {
      setExpanded((prev) =>
        prev[node.categoryId] ? prev : { ...prev, [node.categoryId]: true },
      )
    }
  }

  const toggleBranch = (id: StudioCategoryId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const goStep = (delta: number) => {
    const next =
      ALL_STUDIO_PAGES[
        (currentIdx + delta + ALL_STUDIO_PAGES.length) % ALL_STUDIO_PAGES.length
      ]
    selectPage(next.id)
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

  const isSearching = searchQuery.trim().length > 0

  return (
    <>
      {/* Minimal Touch-First Mobile Customize View (< 1024px) */}
      <MobileCustomizeView
        settings={settings}
        section={section}
        isModified={isModified}
        onChange={onChange}
        onSelectTheme={handleSelectTheme}
        onToggleMode={handleToggleMode}
        onReset={onReset}
        onBack={onBack}
      />

      {/* Full-Screen Desktop Appearance Studio (>= 1024px) */}
      <div className="zuno-canvas hidden h-full min-h-0 w-full flex-row bg-background lg:flex">
      {/* Desktop Left Collapsible Hierarchy Tree Sidebar */}
      <aside className="flex w-[274px] shrink-0 flex-col border-r border-border bg-card/60">
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

        {/* Search Components Input */}
        <div className="border-b border-border/70 px-3 py-3">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && firstFilteredPage) {
                  selectPage(firstFilteredPage.id)
                } else if (e.key === 'Escape') {
                  setSearchQuery('')
                  searchRef.current?.blur()
                }
              }}
              placeholder="Search…"
              aria-label="Search Customize"
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

        {/* Collapsible Component Hierarchy Tree */}
        <CompactScrollArea className="flex-1" viewportClassName="px-2.5 py-3">
          {filteredTree.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-muted-foreground">No matching components</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground hover:bg-secondary cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredTree.map((branch) => {
                const BranchIcon = branch.icon
                const isOpen = isSearching || expanded[branch.id]
                const hasActiveChild = branch.children.some((c) => c.id === activePage)

                return (
                  <div key={branch.id} className="select-none">
                    {/* Parent Category Header */}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleBranch(branch.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-colors cursor-pointer',
                        hasActiveChild && !isOpen
                          ? 'bg-secondary/75 text-foreground'
                          : 'text-foreground/90 hover:bg-secondary/50',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <AccordionChevron
                          open={isOpen}
                          className={cn(
                            'shrink-0',
                            isOpen ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        />
                        <BranchIcon
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            hasActiveChild ? 'text-primary' : 'text-muted-foreground',
                          )}
                        />
                        <span className="truncate text-[12px] font-semibold tracking-tight">
                          {branch.label}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5">
                        {hasActiveChild && !isOpen && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                        <span className="rounded-md bg-secondary/80 px-1.5 py-0.5 font-mono text-[9.5px] tabular-nums text-muted-foreground">
                          {branch.children.length}
                        </span>
                      </span>
                    </button>

                    {/* Indented Child Component Tree (transitions.dev 21 · Accordion expand) */}
                    <AccordionPanel open={isOpen}>
                      <div className="ml-3.5 space-y-0.5 border-l border-border/80 pl-2.5 pt-0.5">
                        {branch.children.map((item) => {
                          const Icon = item.icon
                          const active = activePage === item.id
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectPage(item.id)}
                              className={cn(
                                't-press relative flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] cursor-pointer',
                                active
                                  ? 'bg-secondary font-medium text-foreground'
                                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                              )}
                            >
                              {active && (
                                <span
                                  aria-hidden="true"
                                  className="absolute -left-[11px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary"
                                />
                              )}
                              <Icon
                                className={cn(
                                  'h-3.5 w-3.5 shrink-0',
                                  active ? 'text-primary' : 'text-muted-foreground/80',
                                )}
                              />
                              <span className="truncate">{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </AccordionPanel>
                  </div>
                )
              })}
            </div>
          )}
        </CompactScrollArea>
      </aside>

      {/* Right Full-Screen Studio Stage */}
      <CompactScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl space-y-6 px-10 pb-14 pt-7">
          {/* Studio Stage Header + Hierarchical Breadcrumb + Prev/Next */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                {currentCategory.label}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
                {currentMeta.label}
              </h1>
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
              <Tooltip label="Previous component" side="bottom">
                <button
                  type="button"
                  onClick={() => goStep(-1)}
                  aria-label="Previous component"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip label="Next component" side="bottom">
                <button
                  type="button"
                  onClick={() => goStep(1)}
                  aria-label="Next component"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ═══════════════════ 1. COLOR THEMES & FONTS ═══════════════════ */}
          <div key={activePage} className="t-page-enter">
          {activePage === 'theme_presets' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <ThemePresetPreview settings={settings} />
              </LivePreviewStage>

              <Group title="Themes">
                <ThemeSelector
                  themes={THEME_PRESETS}
                  value={settings.theme}
                  mode={settings.mode}
                  onChange={handleSelectTheme}
                />
              </Group>
            </div>
          )}

          {activePage === 'custom_palette' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
                actions={
                  (hasCustomColors || settings.accent !== 'mono') && (
                    <button
                      type="button"
                      onClick={() => onChange({ accent: 'mono', customColors: {} })}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[10.5px] font-sans font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  )
                }
              >
                <PaletteBalancePreview settings={settings} />
              </LivePreviewStage>

              <Group title="Accent">
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
                            : 'border-border bg-card text-muted-foreground hover:text-foreground',
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
              </Group>

              <Group title="Custom Colors">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CUSTOM_COLOR_SLOTS.map((slot) => (
                    <div
                      key={slot.key}
                      className="relative flex flex-col gap-2 rounded-xl border border-border bg-card p-3 focus-within:z-30"
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
              </Group>
            </div>
          )}

          {activePage === 'typography_fonts' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <TypographyPreview settings={settings} />
              </LivePreviewStage>

              <Group title="Text Size">
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

              <CustomFontStudio settings={settings} onChange={onChange} />
            </div>
          )}

          {/* ═══════════════════ 2. WINDOW, CHROME & NAV ═══════════════════ */}
          {activePage === 'window_corners' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <WindowCornersPreview settings={settings} />
              </LivePreviewStage>

              <Group title="Corner Curve">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      { id: 'sharp', label: 'Sharp', px: '0px', desc: 'Flush edges' },
                      { id: 'soft', label: 'Soft', px: '10px', desc: 'Subtle curve' },
                      {
                        id: 'curved',
                        label: 'Curved',
                        px: '16px',
                        desc: 'Balanced',
                        recommended: true,
                      },
                      { id: 'pill', label: 'Extra', px: '22px', desc: 'Deep curve' },
                    ] as {
                      id: WindowRadiusId
                      label: string
                      px: string
                      desc: string
                      recommended?: boolean
                    }[]
                  ).map((opt) => {
                    const active = settings.windowRadius === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ windowRadius: opt.id })}
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="flex h-12 w-full items-end justify-start overflow-hidden rounded-xl border border-border/60 bg-background/80 p-2">
                          <div
                            className={cn(
                              'h-8 w-16 border-t-2 border-r-2 border-primary/80 bg-secondary/80',
                              WINDOW_CORNER_PREVIEW_CLASS[opt.id],
                            )}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                              <span>{opt.label}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {opt.px}
                              </span>
                            </span>
                            {active ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : opt.recommended ? (
                              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                                Rec
                              </span>
                            ) : null}
                          </div>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>
            </div>
          )}

          {activePage === 'top_titlebar' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <div
                  className={cn(
                    'w-full max-w-xl overflow-hidden border border-border bg-background shadow-lg transition-[border-radius] duration-200',
                    windowRadiusClass(settings.windowRadius),
                  )}
                >
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
                  <div className="flex h-14 items-center justify-center bg-background/80 px-4 text-xs text-muted-foreground">
                    Drag to move · double-click to maximize
                  </div>
                </div>
              </LivePreviewStage>

              <Group title="Controls Style">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      { id: 'minimal', label: 'Minimal', desc: 'Clean circular buttons' },
                      { id: 'macos', label: 'Traffic Lights', desc: 'Color dots on hover' },
                      { id: 'dots', label: 'Mono Dots', desc: 'Theme-matched dots' },
                      { id: 'pill', label: 'Floating Pill', desc: 'Grouped pill capsule' },
                      { id: 'geometric', label: 'Sharp', desc: 'Square framed keys' },
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

              <Group title="Alignment">
                <Segmented<TitlebarAlignId>
                  value={settings.titlebarAlign}
                  onChange={(titlebarAlign) => onChange({ titlebarAlign })}
                  options={[
                    { value: 'right', label: 'Right' },
                    { value: 'left', label: 'Left (macOS)' },
                  ]}
                />
              </Group>

              <Group title="Options">
                <div className="z-surface-card divide-y divide-border rounded-2xl border border-border bg-card">
                  <ToggleRow
                    label="Show playing track in titlebar"
                    checked={settings.titlebarShowTrack}
                    onChange={(titlebarShowTrack) => onChange({ titlebarShowTrack })}
                  />
                  <ToggleRow
                    label="Compact titlebar"
                    checked={settings.titlebarCompact}
                    onChange={(titlebarCompact) => onChange({ titlebarCompact })}
                  />
                </div>
              </Group>
            </div>
          )}

          {activePage === 'desktop_nav' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <DesktopNavPreview settings={settings} />
              </LivePreviewStage>

              <Group title="Navigation Style">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        id: 'sidebar',
                        label: 'Sidebar',
                        desc: 'Left rail with playlists',
                      },
                      {
                        id: 'floating-navbar',
                        label: 'Floating Bar',
                        desc: 'Top pill, auto-hides on scroll',
                        recommended: true,
                      },
                      {
                        id: 'floating-dock',
                        label: 'Floating Dock',
                        desc: 'Compact dock + menu',
                      },
                      {
                        id: 'floating-menu',
                        label: 'Capsule Menu',
                        desc: 'Corner pill + full menu',
                      },
                    ] as { id: NavStyleId; label: string; desc: string; recommended?: boolean }[]
                  ).map((opt) => {
                    const active = settings.navStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ navStyle: opt.id })}
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        {/* Mini Schematic Layout Preview */}
                        <div className="relative flex h-16 w-full overflow-hidden rounded-xl border border-border bg-background/80 p-2">
                          {opt.id === 'sidebar' && (
                            <div className="flex h-full w-full gap-2">
                              <div className="flex w-10 flex-col gap-1 rounded-md border border-border bg-card p-1">
                                <span className="h-1.5 w-full rounded bg-primary/80" />
                                <span className="h-1 w-4/5 rounded bg-muted-foreground/30" />
                                <span className="h-1 w-3/5 rounded bg-muted-foreground/20" />
                              </div>
                              <div className="flex-1 space-y-1.5 pt-1">
                                <span className="block h-1.5 w-16 rounded bg-muted-foreground/35" />
                                <span className="block h-3 w-full rounded bg-secondary" />
                              </div>
                            </div>
                          )}
                          {opt.id === 'floating-navbar' && (
                            <div className="flex h-full w-full flex-col items-center justify-between">
                              <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
                                <span className="h-1.5 w-5 rounded-full bg-primary" />
                                <span className="h-1.5 w-4 rounded-full bg-muted-foreground/40" />
                                <span className="h-1.5 w-4 rounded-full bg-muted-foreground/30" />
                              </div>
                              <span className="h-3 w-4/5 rounded bg-secondary" />
                            </div>
                          )}
                          {opt.id === 'floating-dock' && (
                            <div className="flex h-full w-full flex-col items-center justify-between">
                              <div className="flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1">
                                <span className="h-3 w-7 rounded-md bg-primary" />
                                <span className="h-3 w-3 rounded-md bg-secondary" />
                                <span className="h-3 w-3 rounded-md bg-secondary" />
                                <span className="h-2.5 w-px bg-border" />
                                <span className="h-3 w-5 rounded-md bg-secondary" />
                              </div>
                              <span className="h-3 w-4/5 rounded bg-secondary" />
                            </div>
                          )}
                          {opt.id === 'floating-menu' && (
                            <div className="flex h-full w-full flex-col justify-between">
                              <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
                                <span className="h-2 w-2 rounded-full bg-primary" />
                                <span className="h-1.5 w-6 rounded bg-foreground/70" />
                              </div>
                              <span className="h-3 w-full rounded bg-secondary" />
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                              <span>{opt.label}</span>
                              {opt.recommended && (
                                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-primary">
                                  Rec
                                </span>
                              )}
                            </span>
                            {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          </div>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>
            </div>
          )}

          {/* ═══════════════════ 3. SURFACES, SCROLL & MOTION ═══════════════════ */}
          {activePage === 'surface_materials' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <SurfaceMaterialPreview settings={settings} />
              </LivePreviewStage>

              <Group title="Surface Style">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      { id: 'bordered', label: 'Framed', desc: 'Card fill + 1px edge' },
                      { id: 'flat', label: 'Flat Matte', desc: 'Matte fill, no border' },
                      { id: 'minimal_top', label: 'Hairline', desc: 'Top divider only' },
                      { id: 'borderless', label: 'Borderless', desc: 'Soft tonal fill' },
                      { id: 'glass', label: 'Glass', desc: 'Frosted blur' },
                      { id: 'elevated', label: 'Elevated', desc: 'Soft shadow' },
                    ] as { id: SurfaceStyleId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.surfaceStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ surfaceStyle: opt.id })}
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div
                          data-surface={opt.id}
                          className="flex h-12 w-full items-center justify-center rounded-xl bg-background/80 p-2"
                        >
                          <div className="z-surface-card flex h-8 w-full items-center justify-between rounded-lg border border-border bg-card px-2.5">
                            <span className="h-1.5 w-12 rounded-full bg-foreground/60" />
                            <span className="h-2 w-2 rounded-full bg-primary" />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                              {opt.label}
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>

              <Group title="Borders">
                <Segmented<BorderStyleId>
                  value={settings.borders}
                  onChange={(borders) => onChange({ borders })}
                  options={[
                    { value: 'borderless', label: 'None' },
                    { value: 'subtle', label: 'Subtle' },
                    { value: 'crisp', label: 'Crisp' },
                  ]}
                />
              </Group>
            </div>
          )}

          {activePage === 'canvas_background' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <CanvasPatternPreview settings={settings} />
              </LivePreviewStage>

              <Group title="Pattern">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {(
                    [
                      { id: 'clean', label: 'Clean', desc: 'Solid canvas' },
                      { id: 'dot_grid', label: 'Dot Grid', desc: 'Dot matrix' },
                      { id: 'fine_grid', label: 'Fine Grid', desc: 'Grid lines' },
                      { id: 'top_glow', label: 'Top Glow', desc: 'Top aura' },
                      { id: 'vignette', label: 'Vignette', desc: 'Edge shade' },
                    ] as { id: BgPatternId; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = settings.bgPattern === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ bgPattern: opt.id })}
                        className={cn(
                          'flex flex-col gap-2.5 rounded-2xl border p-3 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div
                          data-bg-pattern={opt.id}
                          className="h-14 w-full overflow-hidden rounded-xl border border-border bg-background"
                        >
                          <div className="zuno-canvas h-full w-full" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-foreground">
                              {opt.label}
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>
            </div>
          )}

          {activePage === 'scroll_progress' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <ScrollProgressLivePreview settings={settings} />
              </LivePreviewStage>

              <Group title="Indicator Style">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      { id: 'none', label: 'None', desc: 'Scrollbar only' },
                      { id: 'skiper89', label: 'Ring Pill', desc: 'Draggable ring' },
                      { id: 'skiper94', label: 'Vertical Rail', desc: 'Edge gauge' },
                      { id: 'skiper95', label: 'Top Hairline', desc: 'Top line', recommended: true },
                    ] as {
                      id: ScrollProgressStyleId
                      label: string
                      desc: string
                      recommended?: boolean
                    }[]
                  ).map((opt) => {
                    const active = settings.scrollProgressStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ scrollProgressStyle: opt.id })}
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-background/70 px-3">
                          {opt.id === 'none' ? (
                            <span className="font-mono text-[10.5px] text-muted-foreground/70">
                              Clean scroll
                            </span>
                          ) : (
                            <ScrollProgressOverlay styleVariant={opt.id} previewRatio={0.62} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {opt.label}
                            </span>
                            {active ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : opt.recommended ? (
                              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                                Rec
                              </span>
                            ) : null}
                          </div>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>
            </div>
          )}

          {activePage === 'scroll_reveal' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <ScrollRevealLivePreview settings={settings} />
              </LivePreviewStage>

              <Group title="Row Reveal">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(
                    [
                      { id: 'none', label: 'Off', desc: 'Instant' },
                      { id: 'slide-fade', label: 'Cascade', desc: 'Slide + fade', recommended: true },
                      { id: 'blur-reveal', label: 'Blur Reveal', desc: 'Soft unblur' },
                    ] as {
                      id: ScrollRevealStyleId
                      label: string
                      desc: string
                      recommended?: boolean
                    }[]
                  ).map((opt) => {
                    const active = settings.scrollRevealStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ scrollRevealStyle: opt.id })}
                        className={cn(
                          'flex flex-col gap-1.5 rounded-2xl border p-4 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-semibold text-foreground">
                            {opt.label}
                          </span>
                          {active ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : opt.recommended ? (
                            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                              Rec
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </Group>
            </div>
          )}

          {activePage === 'theme_toggle' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <ThemeToggleLivePreview settings={settings} onToggleMode={handleToggleMode} />
              </LivePreviewStage>

              <Group title="Toggle Icon">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      { id: 'eclipse', label: 'Eclipse', desc: 'Crescent & rays' },
                      { id: 'smoothui', label: 'Kinetic', desc: 'Spring morph', recommended: true },
                      { id: 'skiper-1', label: 'Split Disc', desc: 'Rotating half disc' },
                      { id: 'skiper-2', label: 'Horizon', desc: 'Rising sun' },
                      { id: 'skiper-3', label: 'Expand Dot', desc: 'Morphing orb' },
                      { id: 'skiper-4', label: 'Orbital', desc: 'Orbiting dot' },
                      { id: 'skiper-5', label: 'Switch Pill', desc: 'Sliding pill' },
                    ] as { id: ThemeToggleStyleId; label: string; desc: string; recommended?: boolean }[]
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
                            {active ? (
                              <Check className="h-3 w-3 shrink-0 text-primary" />
                            ) : opt.recommended ? (
                              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                                Rec
                              </span>
                            ) : null}
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
            </div>
          )}

          {activePage === 'theme_transitions' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <ThemeTransitionLivePreview settings={settings} onToggleMode={handleToggleMode} />
              </LivePreviewStage>

              <Group title="Transition Style">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      { id: 'circle-blur', label: 'Circle Blur', desc: 'Soft radial ripple', recommended: true },
                      { id: 'circle', label: 'Circle Wipe', desc: 'Sharp circle clip' },
                      { id: 'blur-fade', label: 'Blur Fade', desc: 'Soft cross-fade' },
                      { id: 'swipe', label: 'Swipe', desc: 'Horizontal sweep' },
                      { id: 'polygon', label: 'Polygon', desc: 'Diagonal wipe' },
                      { id: 'bottom-up', label: 'Curtain', desc: 'Bottom-up reveal' },
                      { id: 'rectangle', label: 'Sweep', desc: 'Top-down reveal' },
                      { id: 'blinds', label: 'Blinds', desc: 'Slatted reveal' },
                    ] as { id: ThemeTransitionId; label: string; desc: string; recommended?: boolean }[]
                  ).map((opt) => {
                    const active = settings.themeTransition === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ themeTransition: opt.id })}
                        className={cn(
                          'flex flex-col gap-1 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <Wand2 className="h-3 w-3 shrink-0 text-primary" />
                            <span className="truncate">{opt.label}</span>
                          </span>
                          {active ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : opt.recommended ? (
                            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                              Rec
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </Group>

              <Group title="Origin">
                <Segmented<ThemeTransitionStartId>
                  value={settings.themeTransitionStart}
                  onChange={(themeTransitionStart) => onChange({ themeTransitionStart })}
                  options={[
                    { value: 'trigger', label: 'Button' },
                    { value: 'center', label: 'Center' },
                    { value: 'top-left', label: 'Top Left' },
                    { value: 'top-right', label: 'Top Right' },
                    { value: 'bottom-left', label: 'Bottom Left' },
                    { value: 'bottom-right', label: 'Bottom Right' },
                  ]}
                />
              </Group>
            </div>
          )}

          {activePage === 'display_zoom' && (
            <DisplayZoomControls
              variant="full"
              uiZoom={settings.uiZoom}
              onZoomChange={(uiZoom) => onChange({ uiZoom })}
            />
          )}

          {activePage === 'layout_geometry' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <LayoutGeometryPreview settings={settings} />
              </LivePreviewStage>

              <Group title="Zoom">
                <DisplayZoomControls
                  variant="compact"
                  uiZoom={settings.uiZoom}
                  onZoomChange={(uiZoom) => onChange({ uiZoom })}
                />
              </Group>

              <div className="grid gap-6 sm:grid-cols-2">
                <Group title="Corner Radius">
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

                <Group title="List Density">
                  <Segmented<DensityId>
                    value={settings.density}
                    onChange={(density) => onChange({ density })}
                    options={[
                      { value: 'compact', label: 'Compact' },
                      { value: 'comfortable', label: 'Default' },
                      { value: 'spacious', label: 'Spacious' },
                    ]}
                  />
                </Group>
              </div>
            </div>
          )}

          {/* ═══════════════════ 4. MUSIC COMPONENTS ═══════════════════ */}
          {activePage === 'playing_track' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <PlayingTrackLivePreview
                  settings={settings}
                  isPlaying={previewPlaying}
                  onTogglePlay={() => setPreviewPlaying((p) => !p)}
                />
              </LivePreviewStage>

              <Group title="Active Row Style">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { id: 'pulse', label: 'Pulse Ring', desc: 'Circular pulse button' },
                      { id: 'equalizer', label: 'Equalizer Bars', desc: 'Cover + 4 bars' },
                      { id: 'pulse-bars', label: 'Pulse Bars', desc: 'Cover + 5 bars' },
                      { id: 'minimal', label: 'Minimal', desc: 'Clean highlight' },
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

              <Group title="Idle Indicator">
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
          )}

          {activePage === 'now_playing_visualizer' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <VisualizerLivePreview
                  settings={settings}
                  isPlaying={previewPlaying}
                  onTogglePlay={() => setPreviewPlaying((p) => !p)}
                />
              </LivePreviewStage>

              <Group title="Style">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      { id: 'orb', label: 'Sound Orb', desc: 'Morphing bass orb', recommended: true },
                      { id: 'wave-bars', label: 'Wave Bars', desc: 'Spectrum bars' },
                      { id: 'fluid-wave', label: 'Harmonic Waves', desc: 'Flowing ribbons' },
                      { id: 'radial-ring', label: 'Bass Ring', desc: 'Radial frequency ring' },
                      { id: 'aurora-pulse', label: 'Ambient Halo', desc: 'Soft stage glow' },
                      { id: 'none', label: 'Off', desc: 'Text only' },
                    ] as {
                      id: VisualizerStyleId
                      label: string
                      desc: string
                      recommended?: boolean
                    }[]
                  ).map((opt) => {
                    const active = settings.visualizerStyle === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ visualizerStyle: opt.id })}
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-secondary/55',
                        )}
                      >
                        {/* Minimalist Schematic Icon Preview */}
                        <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-background/80">
                          {opt.id === 'orb' && (
                            <div className="relative flex h-11 w-11 items-center justify-center">
                              <span className="absolute inset-0 rounded-full border border-primary/35" />
                              <span className="h-7 w-7 rounded-full bg-gradient-to-br from-foreground via-primary to-primary/30 shadow-md" />
                            </div>
                          )}
                          {opt.id === 'wave-bars' && (
                            <div className="flex h-9 items-end gap-1">
                              {[35, 60, 88, 100, 74, 52, 82, 95, 65, 38].map((h, i) => (
                                <span
                                  key={i}
                                  style={{ height: `${h}%` }}
                                  className="w-1.5 rounded-full bg-primary/85"
                                />
                              ))}
                            </div>
                          )}
                          {opt.id === 'fluid-wave' && (
                            <svg viewBox="0 0 120 40" className="h-10 w-28" aria-hidden="true">
                              <path
                                d="M4 20 Q 22 4, 42 20 T 80 20 T 116 20"
                                fill="none"
                                stroke="var(--primary)"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                              />
                              <path
                                d="M4 20 Q 28 34, 52 20 T 94 20 T 116 20"
                                fill="none"
                                stroke="var(--foreground)"
                                strokeOpacity="0.45"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                          {opt.id === 'radial-ring' && (
                            <div className="relative flex h-11 w-11 items-center justify-center">
                              <span className="h-10 w-10 rounded-full border-2 border-dashed border-primary/75" />
                              <span className="absolute h-5 w-5 rounded-full border border-primary bg-primary/20" />
                            </div>
                          )}
                          {opt.id === 'aurora-pulse' && (
                            <div className="relative flex h-full w-full items-center justify-center">
                              <span className="h-12 w-24 rounded-full bg-primary/20 blur-md" />
                              <span className="absolute font-mono text-[10px] font-medium text-foreground/80">
                                Track
                              </span>
                            </div>
                          )}
                          {opt.id === 'none' && (
                            <span className="font-mono text-[10.5px] text-muted-foreground/70">
                              Text only
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-semibold text-foreground">
                              {opt.label}
                            </span>
                            {active ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : opt.recommended ? (
                              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                                Rec
                              </span>
                            ) : null}
                          </div>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Group>

              <div className="grid gap-6 sm:grid-cols-2">
                <Group title="Color">
                  <Segmented<VisualizerColorId>
                    value={settings.visualizerColor}
                    onChange={(visualizerColor) => onChange({ visualizerColor })}
                    options={[
                      { value: 'theme', label: 'Theme' },
                      { value: 'spectrum', label: 'Spectrum' },
                      { value: 'mono', label: 'Mono' },
                    ]}
                  />
                </Group>

                <Group title="Reactivity">
                  <Segmented<VisualizerIntensityId>
                    value={settings.visualizerIntensity}
                    onChange={(visualizerIntensity) => onChange({ visualizerIntensity })}
                    options={[
                      { value: 'subtle', label: 'Subtle' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'dynamic', label: 'Dynamic' },
                    ]}
                  />
                </Group>
              </div>
            </div>
          )}

          {activePage === 'scrubber' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
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

              <Group title="Style">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      { id: 'ring', label: 'Hollow Ring', desc: 'Ring handle' },
                      { id: 'solid', label: 'Solid Dot', desc: 'Filled dot' },
                      { id: 'line', label: 'Line', desc: 'Clean line' },
                      { id: 'pill', label: 'Vertical Pill', desc: 'Vertical marker' },
                      { id: 'capsule', label: 'Capsule', desc: 'Thick pill bar' },
                      { id: 'waveform', label: 'Waveform', desc: 'Audio waveform' },
                      { id: 'ticks', label: 'Ticks', desc: 'Ruler ticks' },
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

          {activePage === 'play_button' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <PlayButtonLivePreview
                  settings={settings}
                  isPlaying={previewPlaying}
                  onTogglePlay={() => setPreviewPlaying((p) => !p)}
                />
              </LivePreviewStage>

              <Group title="Style">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(
                    [
                      { id: 'classic', label: 'Classic', desc: 'Clean play / pause' },
                      { id: 'waveform', label: 'Waveform', desc: 'Animated bars' },
                      { id: 'vinyl', label: 'Vinyl', desc: 'Spinning disc' },
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
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-foreground">{opt.label}</p>
                            {active && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
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
            </div>
          )}

          {activePage === 'player_bar' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <PlayerBarAndRowsPreview
                  settings={settings}
                  isPlaying={previewPlaying}
                  onTogglePlay={() => setPreviewPlaying((p) => !p)}
                />
              </LivePreviewStage>

              <Group title="Bar Layout">
                <Segmented<PlayerBarStyleId>
                  value={settings.playerBarStyle}
                  onChange={(playerBarStyle) => onChange({ playerBarStyle })}
                  options={[
                    { value: 'floating', label: 'Floating' },
                    { value: 'docked', label: 'Docked' },
                  ]}
                />
              </Group>

              <Group title="Visibility">
                <div className="z-surface-card divide-y divide-border rounded-2xl border border-border bg-card">
                  <ToggleRow
                    label="Bottom dock blur"
                    checked={settings.dockGradualBlur}
                    onChange={(dockGradualBlur) => onChange({ dockGradualBlur })}
                  />
                  <ToggleRow
                    label="Play button pulse"
                    checked={settings.showPlayPulse}
                    onChange={(showPlayPulse) => onChange({ showPlayPulse })}
                  />
                  <ToggleRow
                    label="Artist / folder overline"
                    checked={settings.showTrackOverline}
                    onChange={(showTrackOverline) => onChange({ showTrackOverline })}
                  />
                  <ToggleRow
                    label="Track duration"
                    checked={settings.showTrackDuration}
                    onChange={(showTrackDuration) => onChange({ showTrackDuration })}
                  />
                </div>
              </Group>
            </div>
          )}

          {activePage === 'audio_crossfade' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
                mode={settings.mode}
                transition={settings.themeTransition}
                transitionStart={settings.themeTransitionStart}
                toggleStyle={settings.themeToggleStyle}
                onToggleMode={handleToggleMode}
              >
                <AudioCrossfadeLivePreview crossfadeSecs={settings.crossfadeSecs} />
              </LivePreviewStage>

              <Group title="Duration">
                <div className="z-surface-card space-y-4 rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {settings.crossfadeSecs > 0
                        ? `${settings.crossfadeSecs.toFixed(settings.crossfadeSecs % 1 === 0 ? 0 : 1)}s fade between tracks`
                        : 'Off'}
                    </p>
                    <span className="rounded-full border border-border bg-secondary px-3 py-1 font-mono text-xs font-semibold tabular-nums text-foreground">
                      {settings.crossfadeSecs > 0
                        ? `${settings.crossfadeSecs.toFixed(settings.crossfadeSecs % 1 === 0 ? 0 : 1)}s`
                        : 'Off'}
                    </span>
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
            </div>
          )}

          {activePage === 'icon_packs' && (
            <div className="space-y-6">
              <LivePreviewStage
                title="Preview"
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

              <Group title="Icon Pack">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

              <Group title="Stroke Weight">
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
            </div>
          )}
          </div>
        </div>
      </CompactScrollArea>
    </div>
    </>
  )
}

function DisplayZoomControls({
  variant,
  uiZoom,
  onZoomChange,
}: {
  variant: 'full' | 'compact'
  uiZoom: number
  onZoomChange: (next: number) => void
}) {
  const stepOut = () => onZoomChange(clampUiZoom(uiZoom - UI_ZOOM_STEP))
  const stepIn = () => onZoomChange(clampUiZoom(uiZoom + UI_ZOOM_STEP))

  if (variant === 'compact') {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uiZoom <= UI_ZOOM_MIN}
              onClick={stepOut}
              aria-label="Zoom out"
              className="t-press flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-secondary disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
            >
              <Minus className="h-4 w-4" />
            </button>

            <span className="min-w-[64px] text-center font-mono text-base font-bold tabular-nums text-foreground">
              {uiZoom}%
            </span>

            <button
              type="button"
              disabled={uiZoom >= UI_ZOOM_MAX}
              onClick={stepIn}
              aria-label="Zoom in"
              className="t-press flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {UI_ZOOM_PRESETS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => onZoomChange(pct)}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums transition-colors cursor-pointer',
                  uiZoom === pct
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {UI_ZOOM_MIN}%
          </span>
          <input
            type="range"
            aria-label="Layout zoom percentage"
            min={UI_ZOOM_MIN}
            max={UI_ZOOM_MAX}
            step={5}
            value={uiZoom}
            onChange={(e) => onZoomChange(clampUiZoom(Number(e.target.value)))}
            className="h-1.5 flex-1 cursor-pointer accent-primary"
          />
          <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {UI_ZOOM_MAX}%
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              INTERFACE ZOOM
            </p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="font-mono text-4xl font-bold tracking-tight tabular-nums text-foreground">
                {uiZoom}%
              </span>
              <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                {(uiZoom / 100).toFixed(2)}×{' '}
                {uiZoom === DEFAULT_APPEARANCE.uiZoom
                  ? 'Default'
                  : uiZoom > DEFAULT_APPEARANCE.uiZoom
                    ? 'Zoomed In'
                    : 'Zoomed Out'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip label={`Zoom out (-${UI_ZOOM_STEP}%) · Ctrl -`} side="top">
              <button
                type="button"
                disabled={uiZoom <= UI_ZOOM_MIN}
                onClick={stepOut}
                aria-label="Zoom out"
                className="t-press flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-secondary disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
            </Tooltip>

            <Tooltip label={`Zoom in (+${UI_ZOOM_STEP}%) · Ctrl +`} side="top">
              <button
                type="button"
                disabled={uiZoom >= UI_ZOOM_MAX}
                onClick={stepIn}
                aria-label="Zoom in"
                className="t-press flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </Tooltip>

            <button
              type="button"
              disabled={uiZoom === DEFAULT_APPEARANCE.uiZoom}
              onClick={() => onZoomChange(DEFAULT_APPEARANCE.uiZoom)}
              className="t-press inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset {DEFAULT_APPEARANCE.uiZoom}%</span>
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {UI_ZOOM_MIN}%
            </span>
            <input
              type="range"
              aria-label="Display zoom percentage"
              min={UI_ZOOM_MIN}
              max={UI_ZOOM_MAX}
              step={5}
              value={uiZoom}
              onChange={(e) => onZoomChange(clampUiZoom(Number(e.target.value)))}
              className="h-1.5 flex-1 cursor-pointer accent-primary"
            />
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {UI_ZOOM_MAX}%
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Shortcuts: <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">Ctrl +</kbd> zoom in ·{' '}
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">Ctrl -</kbd> zoom out ·{' '}
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">Ctrl 0</kbd> reset ·{' '}
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">Ctrl + Scroll</kbd>
          </p>
        </div>
      </div>

      <Group title="Presets">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {UI_ZOOM_PRESETS.map((pct) => {
            const active = uiZoom === pct
            return (
              <button
                key={pct}
                type="button"
                onClick={() => onZoomChange(pct)}
                className={cn(
                  't-press flex h-11 flex-col items-center justify-center rounded-xl border font-mono text-xs font-semibold tabular-nums transition-colors cursor-pointer',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-border bg-card text-foreground hover:bg-secondary',
                )}
              >
                <span>{pct}%</span>
                {pct === DEFAULT_APPEARANCE.uiZoom && (
                  <span
                    className={cn(
                      'text-[9px] font-sans font-normal',
                      active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    Default
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Group>
    </div>
  )
}

function Group({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
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
    <SlidingTabs<T>
      value={value}
      options={options}
      onChange={onChange}
      variant="card"
      wrap
    />
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-secondary/40 cursor-pointer"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <MotionSwitch checked={checked} interactive={false} size="sm" />
    </button>
  )
}
