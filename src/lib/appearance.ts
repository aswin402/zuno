export type ThemePresetId = 'zinc-dark' | 'oled-black' | 'stone-dark' | 'slate-dark' | 'zinc-light'
export type AccentId = 'mono' | 'emerald' | 'blue' | 'violet' | 'rose' | 'amber'
export type FontFamilyId = 'geist' | 'inter' | 'jakarta' | 'space' | 'mono' | 'system'
export type FontSizeId = 'sm' | 'md' | 'lg'
export type RadiusStyleId = 'sharp' | 'balanced' | 'round'
export type DensityId = 'compact' | 'comfortable' | 'spacious'
export type BorderStyleId = 'subtle' | 'crisp' | 'borderless'
export type IconStrokeId = 'thin' | 'regular' | 'bold'
export type TrackIconStyleId = 'ring' | 'filled' | 'minimal' | 'number'
export type PlayerBarStyleId = 'docked' | 'floating'
export type ScrubberKnobStyleId = 'ring' | 'solid' | 'line'

export interface AppearanceSettings {
  theme: ThemePresetId
  accent: AccentId
  fontFamily: FontFamilyId
  fontSize: FontSizeId
  radius: RadiusStyleId
  density: DensityId
  borders: BorderStyleId
  iconStroke: IconStrokeId
  trackIconStyle: TrackIconStyleId
  playerBarStyle: PlayerBarStyleId
  scrubberKnob: ScrubberKnobStyleId
  showLastPlayed: boolean
  showInlineProgress: boolean
  showTrackOverline: boolean
  showTrackDuration: boolean
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'zinc-dark',
  accent: 'mono',
  fontFamily: 'geist',
  fontSize: 'md',
  radius: 'balanced',
  density: 'comfortable',
  borders: 'subtle',
  iconStroke: 'regular',
  trackIconStyle: 'ring',
  playerBarStyle: 'docked',
  scrubberKnob: 'ring',
  showLastPlayed: true,
  showInlineProgress: true,
  showTrackOverline: true,
  showTrackDuration: true,
}

const STORAGE_KEY = 'zuno:appearance'

export interface ThemePalette {
  id: ThemePresetId
  label: string
  isDark: boolean
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

export const THEME_PRESETS: ThemePalette[] = [
  {
    id: 'zinc-dark',
    label: 'Zinc Dark',
    isDark: true,
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
  {
    id: 'oled-black',
    label: 'OLED Black',
    isDark: true,
    background: '#000000',
    foreground: '#ffffff',
    card: '#09090b',
    popover: '#0d0d10',
    secondary: '#121215',
    mutedForeground: '#a1a1aa',
    accentBg: '#202024',
    border: '#1f1f23',
    borderCrisp: '#36363c',
    primary: '#ffffff',
    primaryForeground: '#000000',
  },
  {
    id: 'stone-dark',
    label: 'Warm Stone',
    isDark: true,
    background: '#0c0a09',
    foreground: '#fafaf9',
    card: '#151210',
    popover: '#181512',
    secondary: '#1c1917',
    mutedForeground: '#a8a29e',
    accentBg: '#292524',
    border: '#292524',
    borderCrisp: '#44403c',
    primary: '#fafaf9',
    primaryForeground: '#0c0a09',
  },
  {
    id: 'slate-dark',
    label: 'Slate Night',
    isDark: true,
    background: '#090d16',
    foreground: '#f8fafc',
    card: '#0f1624',
    popover: '#11192a',
    secondary: '#172033',
    mutedForeground: '#94a3b8',
    accentBg: '#243047',
    border: '#1e293b',
    borderCrisp: '#334155',
    primary: '#f8fafc',
    primaryForeground: '#090d16',
  },
  {
    id: 'zinc-light',
    label: 'Zinc Light',
    isDark: false,
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
  { id: 'mono', label: 'Default', swatch: '#fafafa' },
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
    label: 'Blue',
    swatch: '#3b82f6',
    darkPrimary: '#60a5fa',
    darkFg: '#081b3a',
    lightPrimary: '#2563eb',
    lightFg: '#ffffff',
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: '#8b5cf6',
    darkPrimary: '#a78bfa',
    darkFg: '#1e0b3a',
    lightPrimary: '#7c3aed',
    lightFg: '#ffffff',
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: '#f43f5e',
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

export const FONT_PRESETS: { id: FontFamilyId; label: string; sample: string; stack: string }[] = [
  {
    id: 'geist',
    label: 'Geist',
    sample: 'Default crisp sans',
    stack: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    sample: 'Clean neutral UI',
    stack: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  {
    id: 'jakarta',
    label: 'Plus Jakarta',
    sample: 'Warm geometric',
    stack: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'space',
    label: 'Space Grotesk',
    sample: 'Modern studio',
    stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'mono',
    label: 'JetBrains Mono',
    sample: 'Technical monospace',
    stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },
  {
    id: 'system',
    label: 'System Native',
    sample: 'Zero-download OS font',
    stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
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

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function saveAppearance(settings: AppearanceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function applyAppearanceToDom(s: AppearanceSettings): void {
  const root = document.documentElement
  const palette = THEME_PRESETS.find((t) => t.id === s.theme) ?? THEME_PRESETS[0]
  const accent = ACCENT_PRESETS.find((a) => a.id === s.accent) ?? ACCENT_PRESETS[0]
  const font = FONT_PRESETS.find((f) => f.id === s.fontFamily) ?? FONT_PRESETS[0]

  root.classList.toggle('dark', palette.isDark)

  const primary =
    accent.id === 'mono'
      ? palette.primary
      : palette.isDark
        ? (accent.darkPrimary ?? palette.primary)
        : (accent.lightPrimary ?? palette.primary)

  const primaryFg =
    accent.id === 'mono'
      ? palette.primaryForeground
      : palette.isDark
        ? (accent.darkFg ?? palette.primaryForeground)
        : (accent.lightFg ?? palette.primaryForeground)

  const border =
    s.borders === 'borderless'
      ? 'transparent'
      : s.borders === 'crisp'
        ? palette.borderCrisp
        : palette.border

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
  root.style.setProperty('--primary', primary)
  root.style.setProperty('--primary-foreground', primaryFg)
  root.style.setProperty('--ring', primary)
  root.style.setProperty('--zuno-font', font.stack)
  root.style.setProperty('--zuno-font-size', FONT_SIZE_MAP[s.fontSize])
  root.style.setProperty('--zuno-icon-stroke', ICON_STROKE_MAP[s.iconStroke])

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', palette.background)
}

export function rowRadiusClass(radius: RadiusStyleId): string {
  switch (radius) {
    case 'sharp':
      return 'rounded-md'
    case 'round':
      return 'rounded-3xl'
    default:
      return 'rounded-2xl'
  }
}

export function rowPaddingClass(density: DensityId): string {
  switch (density) {
    case 'compact':
      return 'py-1.5 px-2.5'
    case 'spacious':
      return 'py-3.5 px-4'
    default:
      return 'py-2.5 px-3'
  }
}
