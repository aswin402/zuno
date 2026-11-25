import { contrastForegroundForHex } from '@/lib/color'
import { resolveMonoFontStack, resolveUiFontStack } from '@/lib/fonts'

export { contrastForegroundForHex }

export type ThemeId =
  | 'zinc'
  | 'oled'
  | 'vermilion'
  | 'stone'
  | 'amber'
  | 'crimson'
  | 'emerald'
  | 'slate'

export type ThemeMode = 'dark' | 'light'
export type AccentId = 'mono' | 'vermilion' | 'emerald' | 'blue' | 'violet' | 'rose' | 'amber'
export type FontSizeId = 'sm' | 'md' | 'lg'
export type RadiusStyleId = 'sharp' | 'balanced' | 'round'
export type DensityId = 'compact' | 'comfortable' | 'spacious'
export type BorderStyleId = 'subtle' | 'crisp' | 'borderless'
export type SurfaceStyleId =
  | 'bordered'
  | 'flat'
  | 'minimal_top'
  | 'borderless'
  | 'glass'
  | 'elevated'
export type BgPatternId = 'clean' | 'dot_grid' | 'fine_grid' | 'top_glow' | 'vignette'
export type ThemeTransitionId =
  | 'circle-blur'
  | 'circle'
  | 'blur-fade'
  | 'swipe'
  | 'polygon'
  | 'bottom-up'
  | 'rectangle'
  | 'blinds'
export type ThemeTransitionStartId =
  | 'trigger'
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
export type ThemeToggleStyleId =
  | 'eclipse'
  | 'smoothui'
  | 'skiper-1'
  | 'skiper-2'
  | 'skiper-3'
  | 'skiper-4'
  | 'skiper-5'
export type ScrollProgressStyleId = 'none' | 'skiper89' | 'skiper94' | 'skiper95'
export type ScrollRevealStyleId = 'none' | 'blur-reveal' | 'slide-fade'
export type NavStyleId = 'sidebar' | 'floating-navbar' | 'floating-dock' | 'floating-menu'
export type WindowRadiusId = 'sharp' | 'soft' | 'curved' | 'pill'
export type IconPackId =
  | 'lucide'
  | 'skiper99'
  | 'tabler'
  | 'iconsax'
  | 'hugeicons'
  | 'itshover'
  | 'pulsoicon'
  | 'humbleicons'
  | 'majesticons'
export type IconStrokeId = 'thin' | 'regular' | 'bold'
export type TrackIconStyleId = 'ring' | 'filled' | 'minimal' | 'number'
export type PlayingStyleId = 'pulse' | 'equalizer' | 'pulse-bars' | 'minimal'
export type PlayButtonStyleId = 'classic' | 'waveform' | 'vinyl'
export type VisualizerStyleId =
  | 'orb'
  | 'wave-bars'
  | 'fluid-wave'
  | 'radial-ring'
  | 'aurora-pulse'
  | 'none'
export type VisualizerColorId = 'theme' | 'spectrum' | 'mono'
export type VisualizerIntensityId = 'subtle' | 'balanced' | 'dynamic'
export type PlayerBarStyleId = 'docked' | 'floating'
export type TitlebarStyleId = 'minimal' | 'macos' | 'dots' | 'pill' | 'geometric'
export type TitlebarAlignId = 'right' | 'left'
export type ScrubberKnobStyleId =
  | 'ring'
  | 'solid'
  | 'line'
  | 'pill'
  | 'capsule'
  | 'waveform'
  | 'ticks'

export interface CustomColorOverrides {
  primary?: string
  background?: string
  secondary?: string
  card?: string
  border?: string
  foreground?: string
  mutedForeground?: string
}

export interface AppearanceSettings {
  theme: ThemeId
  mode: ThemeMode
  accent: AccentId
  customColors: CustomColorOverrides
  fontFamily: string
  monoFont: string
  customUiFont: string
  customMonoFont: string
  fontSize: FontSizeId
  radius: RadiusStyleId
  density: DensityId
  borders: BorderStyleId
  surfaceStyle: SurfaceStyleId
  bgPattern: BgPatternId
  themeTransition: ThemeTransitionId
  themeTransitionStart: ThemeTransitionStartId
  themeToggleStyle: ThemeToggleStyleId
  scrollProgressStyle: ScrollProgressStyleId
  scrollRevealStyle: ScrollRevealStyleId
  navStyle: NavStyleId
  windowRadius: WindowRadiusId
  iconPack: IconPackId
  iconStroke: IconStrokeId
  trackIconStyle: TrackIconStyleId
  playingStyle: PlayingStyleId
  playButtonStyle: PlayButtonStyleId
  visualizerStyle: VisualizerStyleId
  visualizerColor: VisualizerColorId
  visualizerIntensity: VisualizerIntensityId
  playerBarStyle: PlayerBarStyleId
  scrubberKnob: ScrubberKnobStyleId
  titlebarStyle: TitlebarStyleId
  titlebarAlign: TitlebarAlignId
  titlebarShowTrack: boolean
  titlebarCompact: boolean
  showLastPlayed: boolean
  showPlayPulse: boolean
  showTrackOverline: boolean
  showTrackDuration: boolean
  /** Progressive bottom-only GradualBlur (React Bits) behind the floating dock. */
  dockGradualBlur: boolean
  /** Audio transition / crossfade & fade-in duration in seconds (0 = off, up to 10s). */
  crossfadeSecs: number
  /** Chrome-style full-interface display zoom percentage (50–200, default 100). */
  uiZoom: number
}

export const UI_ZOOM_MIN = 50
export const UI_ZOOM_MAX = 200
export const UI_ZOOM_STEP = 10
export const UI_ZOOM_PRESETS = [75, 80, 90, 100, 110, 125, 150, 175, 200] as const

export function clampUiZoom(pct: number): number {
  if (!Number.isFinite(pct)) return 100
  return Math.round(Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, pct)))
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'zinc',
  mode: 'dark',
  accent: 'mono',
  customColors: {},
  fontFamily: 'geist',
  monoFont: 'jetbrains',
  customUiFont: '',
  customMonoFont: '',
  fontSize: 'md',
  radius: 'balanced',
  density: 'comfortable',
  borders: 'subtle',
  surfaceStyle: 'bordered',
  bgPattern: 'clean',
  themeTransition: 'circle-blur',
  themeTransitionStart: 'trigger',
  themeToggleStyle: 'eclipse',
  scrollProgressStyle: 'skiper95',
  scrollRevealStyle: 'none',
  navStyle: 'sidebar',
  windowRadius: 'curved',
  iconPack: 'lucide',
  iconStroke: 'regular',
  trackIconStyle: 'ring',
  playingStyle: 'pulse',
  playButtonStyle: 'classic',
  visualizerStyle: 'orb',
  visualizerColor: 'theme',
  visualizerIntensity: 'balanced',
  playerBarStyle: 'floating',
  scrubberKnob: 'ring',
  titlebarStyle: 'minimal',
  titlebarAlign: 'right',
  titlebarShowTrack: true,
  titlebarCompact: false,
  showLastPlayed: true,
  showPlayPulse: true,
  showTrackOverline: true,
  showTrackDuration: true,
  dockGradualBlur: true,
  crossfadeSecs: 0,
  uiZoom: 100,
}

export const APPEARANCE_STORAGE_KEY = 'zuno:appearance'

export interface ModePalette {
  background: string
  foreground: string
  card: string
  popover: string
  secondary: string
  mutedForeground: string
  accentBg: string
  border: string
  borderCrisp: string
  primary: string
  primaryForeground: string
}

export interface DualThemePreset {
  id: ThemeId
  label: string
  dark: ModePalette
  light: ModePalette
}

/**
 * Curated dual-mode (Dark + Light) theme families inspired by Zenko WebUI's 60/30/10 system.
 * Default stays Obsidian Mono (`zinc`) for Zuno's crisp shadcn monochrome look.
 */
export const THEME_PRESETS: DualThemePreset[] = [
  {
    id: 'zinc',
    label: 'Obsidian Mono',
    dark: {
      background: '#09090b',
      foreground: '#fafafa',
      card: '#121215',
      popover: '#141417',
      secondary: '#18181b',
      mutedForeground: '#a1a1aa',
      accentBg: '#27272a',
      border: '#27272a',
      borderCrisp: '#3f3f46',
      primary: '#fafafa',
      primaryForeground: '#09090b',
    },
    light: {
      background: '#ffffff',
      foreground: '#09090b',
      card: '#f8f8f9',
      popover: '#ffffff',
      secondary: '#f4f4f5',
      mutedForeground: '#71717a',
      accentBg: '#e4e4e7',
      border: '#e4e4e7',
      borderCrisp: '#c4c4cc',
      primary: '#18181b',
      primaryForeground: '#fafafa',
    },
  },
  {
    id: 'oled',
    label: 'Pure OLED',
    dark: {
      background: '#000000',
      foreground: '#ffffff',
      card: '#0a0a0c',
      popover: '#0e0e11',
      secondary: '#121216',
      mutedForeground: '#8e8e97',
      accentBg: '#202026',
      border: '#1e1e24',
      borderCrisp: '#36363f',
      primary: '#ffffff',
      primaryForeground: '#000000',
    },
    light: {
      background: '#ffffff',
      foreground: '#050506',
      card: '#fafafa',
      popover: '#ffffff',
      secondary: '#f3f3f6',
      mutedForeground: '#6e6e77',
      accentBg: '#e5e5ea',
      border: '#e5e5ea',
      borderCrisp: '#c2c2ca',
      primary: '#050506',
      primaryForeground: '#ffffff',
    },
  },
  {
    id: 'vermilion',
    label: 'Zenko Vermilion',
    dark: {
      background: '#0a0a0b',
      foreground: '#f5f5f6',
      card: '#141417',
      popover: '#111114',
      secondary: '#18181c',
      mutedForeground: '#8a8a93',
      accentBg: '#26262c',
      border: '#222227',
      borderCrisp: '#393942',
      primary: '#ea5829',
      primaryForeground: '#ffffff',
    },
    light: {
      background: '#fafafa',
      foreground: '#0b0b0d',
      card: '#ffffff',
      popover: '#ffffff',
      secondary: '#f1f1f4',
      mutedForeground: '#6b6b76',
      accentBg: '#e4e4ea',
      border: '#e2e2e7',
      borderCrisp: '#c4c4cf',
      primary: '#ea5829',
      primaryForeground: '#ffffff',
    },
  },
  {
    id: 'stone',
    label: 'Warm Terracotta',
    dark: {
      background: '#0e0c0a',
      foreground: '#f8f4ef',
      card: '#181411',
      popover: '#15120f',
      secondary: '#211c17',
      mutedForeground: '#9d9287',
      accentBg: '#302922',
      border: '#2e2721',
      borderCrisp: '#493e35',
      primary: '#d95b26',
      primaryForeground: '#ffffff',
    },
    light: {
      background: '#f7f5f0',
      foreground: '#1c1917',
      card: '#ffffff',
      popover: '#ffffff',
      secondary: '#ede9e0',
      mutedForeground: '#78716c',
      accentBg: '#dfd9ce',
      border: '#dfdad0',
      borderCrisp: '#bfb7a8',
      primary: '#c2410c',
      primaryForeground: '#ffffff',
    },
  },
  {
    id: 'amber',
    label: 'Amber Forge',
    dark: {
      background: '#0d0b08',
      foreground: '#faf5eb',
      card: '#16120d',
      popover: '#13100b',
      secondary: '#201a12',
      mutedForeground: '#a69882',
      accentBg: '#30271b',
      border: '#2c2419',
      borderCrisp: '#473a29',
      primary: '#f59e0b',
      primaryForeground: '#0d0b08',
    },
    light: {
      background: '#fbf9f4',
      foreground: '#1c160b',
      card: '#ffffff',
      popover: '#ffffff',
      secondary: '#f3eee3',
      mutedForeground: '#7c6f59',
      accentBg: '#e6decb',
      border: '#e5dccb',
      borderCrisp: '#c7baa0',
      primary: '#d97706',
      primaryForeground: '#ffffff',
    },
  },
  {
    id: 'crimson',
    label: 'Crimson Noir',
    dark: {
      background: '#0b090a',
      foreground: '#fafafa',
      card: '#151013',
      popover: '#120e10',
      secondary: '#1e161a',
      mutedForeground: '#a08b94',
      accentBg: '#2e2228',
      border: '#2a1f24',
      borderCrisp: '#46343c',
      primary: '#e11d48',
      primaryForeground: '#ffffff',
    },
    light: {
      background: '#fbf8f9',
      foreground: '#190c11',
      card: '#ffffff',
      popover: '#ffffff',
      secondary: '#f4ecef',
      mutedForeground: '#7d646f',
      accentBg: '#e7d9df',
      border: '#e6d8de',
      borderCrisp: '#cab4be',
      primary: '#e11d48',
      primaryForeground: '#ffffff',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald Term',
    dark: {
      background: '#070c0a',
      foreground: '#f0fdf4',
      card: '#0e1713',
      popover: '#0b120f',
      secondary: '#14211b',
      mutedForeground: '#7f9c8d',
      accentBg: '#1e3229',
      border: '#1c2d25',
      borderCrisp: '#2f4b3e',
      primary: '#10b981',
      primaryForeground: '#052016',
    },
    light: {
      background: '#f6f8f6',
      foreground: '#101914',
      card: '#ffffff',
      popover: '#ffffff',
      secondary: '#eaefea',
      mutedForeground: '#5b6b61',
      accentBg: '#d8e2d9',
      border: '#d9e2da',
      borderCrisp: '#b4c5b6',
      primary: '#059669',
      primaryForeground: '#ffffff',
    },
  },
  {
    id: 'slate',
    label: 'Midnight Slate',
    dark: {
      background: '#0a0c14',
      foreground: '#f1f5f9',
      card: '#121624',
      popover: '#0f121d',
      secondary: '#181e30',
      mutedForeground: '#8c96b0',
      accentBg: '#252e47',
      border: '#242a40',
      borderCrisp: '#3b4566',
      primary: '#818cf8',
      primaryForeground: '#0a0c14',
    },
    light: {
      background: '#f7f8fc',
      foreground: '#0f1426',
      card: '#ffffff',
      popover: '#ffffff',
      secondary: '#edf0f9',
      mutedForeground: '#646d8a',
      accentBg: '#dce1f1',
      border: '#dce1f1',
      borderCrisp: '#b8c1de',
      primary: '#4f46e5',
      primaryForeground: '#ffffff',
    },
  },
]

export const ACCENT_PRESETS: {
  id: AccentId
  label: string
  swatch: string
  darkPrimary?: string
  darkFg?: string
  lightPrimary?: string
  lightFg?: string
}[] = [
  { id: 'mono', label: 'Theme Default', swatch: '#fafafa' },
  {
    id: 'vermilion',
    label: 'Vermilion',
    swatch: '#ea5829',
    darkPrimary: '#ea5829',
    darkFg: '#ffffff',
    lightPrimary: '#ea5829',
    lightFg: '#ffffff',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#10b981',
    darkPrimary: '#34d399',
    darkFg: '#052e16',
    lightPrimary: '#059669',
    lightFg: '#ffffff',
  },
  {
    id: 'blue',
    label: 'Arctic Blue',
    swatch: '#3b82f6',
    darkPrimary: '#60a5fa',
    darkFg: '#081b3a',
    lightPrimary: '#2563eb',
    lightFg: '#ffffff',
  },
  {
    id: 'violet',
    label: 'Indigo',
    swatch: '#818cf8',
    darkPrimary: '#a78bfa',
    darkFg: '#1e0b3a',
    lightPrimary: '#7c3aed',
    lightFg: '#ffffff',
  },
  {
    id: 'rose',
    label: 'Crimson',
    swatch: '#e11d48',
    darkPrimary: '#fb7185',
    darkFg: '#2d0611',
    lightPrimary: '#e11d48',
    lightFg: '#ffffff',
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: '#f59e0b',
    darkPrimary: '#fbbf24',
    darkFg: '#291700',
    lightPrimary: '#d97706',
    lightFg: '#ffffff',
  },
]

export const ICON_PACK_OPTIONS: {
  id: IconPackId
  label: string
  desc: string
  animated?: boolean
}[] = [
  { id: 'lucide', label: 'Lucide', desc: 'Clean balanced strokes' },
  {
    id: 'skiper99',
    label: 'Skiper 99 Animated',
    desc: 'Kinetic wave, arrow & morph motion',
    animated: true,
  },
  { id: 'tabler', label: 'Tabler', desc: 'Crisp precision 24px geometry' },
  { id: 'iconsax', label: 'Iconsax', desc: 'Soft curved duotone lines' },
  { id: 'hugeicons', label: 'Hugeicons Animated', desc: 'Rounded float micro-motion', animated: true },
  { id: 'itshover', label: 'ItsHover', desc: 'Interactive spring wiggle', animated: true },
  { id: 'pulsoicon', label: 'PulsoIcon', desc: 'Bouncy micro-pulse hover', animated: true },
  { id: 'humbleicons', label: 'Humbleicons', desc: 'Minimal hand-crafted lines' },
  { id: 'majesticons', label: 'Majesticons', desc: 'Confident bold interface glyphs' },
]

const FONT_SIZE_MAP: Record<FontSizeId, string> = {
  sm: '13px',
  md: '14px',
  lg: '15.5px',
}

const ICON_STROKE_MAP: Record<IconStrokeId, string> = {
  thin: '1.25',
  regular: '1.75',
  bold: '2.25',
}

export function resolveEffectivePalette(s: AppearanceSettings): ModePalette {
  const preset = THEME_PRESETS.find((t) => t.id === s.theme) ?? THEME_PRESETS[0]
  const base = s.mode === 'light' ? preset.light : preset.dark
  const isDark = s.mode === 'dark'
  const accent = ACCENT_PRESETS.find((a) => a.id === s.accent) ?? ACCENT_PRESETS[0]

  const accentPair =
    accent.id === 'mono'
      ? { primary: base.primary, fg: base.primaryForeground }
      : isDark
        ? { primary: accent.darkPrimary ?? base.primary, fg: accent.darkFg ?? base.primaryForeground }
        : { primary: accent.lightPrimary ?? base.primary, fg: accent.lightFg ?? base.primaryForeground }

  let primary = accentPair.primary
  let primaryForeground = accentPair.fg

  const cc = s.customColors ?? {}
  if (cc.primary) {
    primary = cc.primary
    primaryForeground = contrastForegroundForHex(cc.primary)
  }

  return {
    background: cc.background || base.background,
    foreground: cc.foreground || base.foreground,
    card: cc.card || base.card,
    popover: cc.card || base.popover,
    secondary: cc.secondary || base.secondary,
    mutedForeground: cc.mutedForeground || base.mutedForeground,
    accentBg: base.accentBg,
    border: cc.border || base.border,
    borderCrisp: cc.border || base.borderCrisp,
    primary,
    primaryForeground,
  }
}

const VALID_THEME_SET: ReadonlySet<ThemeId> = new Set(THEME_PRESETS.map((t) => t.id))

const LEGACY_THEME_MIGRATION: Record<string, { theme: ThemeId; mode: ThemeMode }> = {
  'zinc-dark': { theme: 'zinc', mode: 'dark' },
  'zinc-light': { theme: 'zinc', mode: 'light' },
  'oled-black': { theme: 'oled', mode: 'dark' },
  'stone-dark': { theme: 'stone', mode: 'dark' },
  'slate-dark': { theme: 'slate', mode: 'dark' },
}

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed = JSON.parse(raw) as Record<string, unknown>

    let theme = typeof parsed.theme === 'string' ? parsed.theme : undefined
    let mode = parsed.mode as ThemeMode | undefined
    const migrated = theme ? LEGACY_THEME_MIGRATION[theme] : undefined
    if (migrated) {
      theme = migrated.theme
      mode ??= migrated.mode
    }

    const validTheme: ThemeId =
      theme && VALID_THEME_SET.has(theme as ThemeId)
        ? (theme as ThemeId)
        : DEFAULT_APPEARANCE.theme

    return {
      ...DEFAULT_APPEARANCE,
      ...parsed,
      theme: validTheme,
      mode: mode === 'light' || mode === 'dark' ? mode : DEFAULT_APPEARANCE.mode,
      customColors:
        parsed.customColors && typeof parsed.customColors === 'object'
          ? (parsed.customColors as CustomColorOverrides)
          : {},
      uiZoom:
        typeof parsed.uiZoom === 'number'
          ? clampUiZoom(parsed.uiZoom)
          : DEFAULT_APPEARANCE.uiZoom,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function saveAppearance(settings: AppearanceSettings): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function applyAppearanceToDom(s: AppearanceSettings): void {
  const root = document.documentElement
  const palette = resolveEffectivePalette(s)
  const isDark = s.mode === 'dark'

  root.classList.toggle('dark', isDark)
  root.dataset.surface = s.surfaceStyle || 'bordered'
  root.dataset.bgPattern = s.bgPattern || 'clean'

  const border =
    s.borders === 'borderless'
      ? 'transparent'
      : s.borders === 'crisp'
        ? palette.borderCrisp
        : palette.border

  const uiStack = resolveUiFontStack(s.fontFamily, s.customUiFont)
  const monoStack = resolveMonoFontStack(s.monoFont, s.customMonoFont)

  root.style.setProperty('--background', palette.background)
  root.style.setProperty('--foreground', palette.foreground)
  root.style.setProperty('--card', palette.card)
  root.style.setProperty('--card-foreground', palette.foreground)
  root.style.setProperty('--popover', palette.popover)
  root.style.setProperty('--popover-foreground', palette.foreground)
  root.style.setProperty('--secondary', palette.secondary)
  root.style.setProperty('--secondary-foreground', palette.foreground)
  root.style.setProperty('--muted', palette.secondary)
  root.style.setProperty('--muted-foreground', palette.mutedForeground)
  root.style.setProperty('--accent', palette.accentBg)
  root.style.setProperty('--accent-foreground', palette.foreground)
  root.style.setProperty('--border', border)
  root.style.setProperty('--input', s.borders === 'borderless' ? palette.border : border)
  root.style.setProperty('--primary', palette.primary)
  root.style.setProperty('--primary-foreground', palette.primaryForeground)
  root.style.setProperty('--ring', palette.primary)
  root.style.setProperty('--zuno-font', uiStack)
  root.style.setProperty('--zuno-mono-font', monoStack)
  root.style.setProperty('--zuno-font-size', FONT_SIZE_MAP[s.fontSize])
  root.style.setProperty('--zuno-icon-stroke', ICON_STROKE_MAP[s.iconStroke])

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', palette.background)
}

const WINDOW_RADIUS_CLASS: Record<WindowRadiusId, string> = {
  sharp: 'rounded-none',
  soft: 'rounded-[10px]',
  curved: 'rounded-[16px]',
  pill: 'rounded-[22px]',
}

const ROW_RADIUS_CLASS: Record<RadiusStyleId, string> = {
  sharp: 'rounded-md',
  balanced: 'rounded-2xl',
  round: 'rounded-3xl',
}

const ROW_PADDING_CLASS: Record<DensityId, string> = {
  compact: 'py-1.5 px-2.5',
  comfortable: 'py-2.5 px-3',
  spacious: 'py-3.5 px-4',
}

export function windowRadiusClass(radius: WindowRadiusId): string {
  return WINDOW_RADIUS_CLASS[radius] ?? WINDOW_RADIUS_CLASS.curved
}

export function rowRadiusClass(radius: RadiusStyleId): string {
  return ROW_RADIUS_CLASS[radius] ?? ROW_RADIUS_CLASS.balanced
}

export function rowPaddingClass(density: DensityId): string {
  return ROW_PADDING_CLASS[density] ?? ROW_PADDING_CLASS.comfortable
}
