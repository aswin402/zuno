export interface FontPreset {
  id: string
  label: string
  hint: string
  stack: string
}

export const UI_FONT_PRESETS: readonly FontPreset[] = [
  {
    id: 'geist',
    label: 'Geist',
    hint: 'Default crisp monochrome sans',
    stack: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  {
    id: 'jakarta',
    label: 'Plus Jakarta Sans',
    hint: 'Clean editorial geometric sans',
    stack: "'Plus Jakarta Sans', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'space',
    label: 'Space Grotesk',
    hint: 'Sharp technical display sans',
    stack: "'Space Grotesk', 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    hint: 'Balanced neutral UI sans',
    stack: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  {
    id: 'obel_mono',
    label: 'Obel Mono',
    hint: 'Variable editorial monospace',
    stack: "'Obel Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: 'halden',
    label: 'Halden',
    hint: 'Neo-grotesque variable sans',
    stack: "'Halden', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'rondel',
    label: 'Rondel',
    hint: 'Precision geometric sans',
    stack: "'Rondel', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'mallow',
    label: 'Mallow',
    hint: 'Friendly rounded sans',
    stack: "'Mallow', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'strata',
    label: 'Strata',
    hint: 'Condensed architectural sans',
    stack: "'Strata', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'vector',
    label: 'Vector',
    hint: 'Crisp technical sans',
    stack: "'Vector', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'folio',
    label: 'Folio',
    hint: 'Editorial book serif',
    stack: "'Folio', ui-serif, Georgia, Cambria, serif",
  },
  {
    id: 'meridian',
    label: 'Meridian',
    hint: 'Transitional serif',
    stack: "'Meridian', ui-serif, Georgia, Cambria, serif",
  },
  {
    id: 'ledger',
    label: 'Ledger',
    hint: 'Confident slab serif',
    stack: "'Ledger', ui-serif, Georgia, Cambria, serif",
  },
  {
    id: 'opaline',
    label: 'Opaline',
    hint: 'High-contrast Didone serif',
    stack: "'Opaline', ui-serif, Georgia, Cambria, serif",
  },
  {
    id: 'vesper',
    label: 'Vesper',
    hint: 'Sculptural display',
    stack: "'Vesper', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'orbit',
    label: 'Orbit',
    hint: 'Futuristic studio display',
    stack: "'Orbit', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'diode',
    label: 'Diode',
    hint: 'Modular geometric display',
    stack: "'Diode', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: 'system',
    label: 'System UI',
    hint: 'Zero-download native OS font',
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
] as const

export const MONO_FONT_PRESETS: readonly FontPreset[] = [
  {
    id: 'obel_mono',
    label: 'Obel Mono',
    hint: 'Variable editorial mono',
    stack: "'Obel Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: 'signal',
    label: 'Signal',
    hint: 'Crisp engineering mono',
    stack: "'Signal', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: 'tally',
    label: 'Tally',
    hint: 'Clean tabular telemetry mono',
    stack: "'Tally', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: 'fathom',
    label: 'Fathom',
    hint: 'Warm readable mono',
    stack: "'Fathom', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    hint: 'Default monospace',
    stack: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  {
    id: 'system',
    label: 'System Mono',
    hint: 'Native OS monospace',
    stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
] as const

const UI_FONT_MAP: Record<string, string> = Object.fromEntries(
  UI_FONT_PRESETS.map((f) => [f.id, f.stack]),
)
const MONO_FONT_MAP: Record<string, string> = Object.fromEntries(
  MONO_FONT_PRESETS.map((f) => [f.id, f.stack]),
)

export const CUSTOM_FONT_STORAGE_KEY = 'zuno.custom_fonts.v1'
export const MAX_CUSTOM_FONT_BYTES = 3 * 1024 * 1024

interface SavedFontPayload {
  family: string
  dataUrl: string
}

type SavedFontMap = Partial<Record<'ui' | 'mono', SavedFontPayload>>

const loadedFontKeys = new Set<string>()

/** Safe CSS font family quoting using single-pass character scan. */
export function sanitizeFontFamilyName(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    const code = raw.charCodeAt(i)
    const allowed =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      ch === ' ' ||
      ch === '-' ||
      ch === '_'
    if (allowed) out += ch
  }
  return out.trim().slice(0, 64)
}

export function resolveUiFontStack(presetId: string, customFamily?: string): string {
  const base = UI_FONT_MAP[presetId] || UI_FONT_MAP.geist
  const clean = sanitizeFontFamilyName(customFamily || '')
  return clean ? `'${clean}', ${base}` : base
}

export function resolveMonoFontStack(presetId: string, customFamily?: string): string {
  const base = MONO_FONT_MAP[presetId] || MONO_FONT_MAP.jetbrains
  const clean = sanitizeFontFamilyName(customFamily || '')
  return clean ? `'${clean}', ${base}` : base
}

function readSavedFonts(): SavedFontMap {
  try {
    const raw = window.localStorage.getItem(CUSTOM_FONT_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedFontMap) : {}
  } catch {
    return {}
  }
}

function writeSavedFonts(map: SavedFontMap) {
  try {
    window.localStorage.setItem(CUSTOM_FONT_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota errors */
  }
}

async function injectFontFace(family: string, dataUrl: string): Promise<void> {
  const key = `${family}::${dataUrl.length}`
  if (loadedFontKeys.has(key) || typeof FontFace === 'undefined') return
  const face = new FontFace(family, `url(${dataUrl})`)
  await face.load()
  document.fonts.add(face)
  loadedFontKeys.add(key)
}

export async function hydrateSavedCustomFonts(): Promise<void> {
  if (typeof window === 'undefined') return
  const saved = readSavedFonts()
  for (const slot of ['ui', 'mono'] as const) {
    const entry = saved[slot]
    if (entry?.family && entry?.dataUrl) {
      try {
        await injectFontFace(entry.family, entry.dataUrl)
      } catch {
        /* ignore corrupted cached font */
      }
    }
  }
}

function deriveFontNameFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return sanitizeFontFamilyName(stem.split('_').join(' ')) || 'Zuno Custom Font'
}

export async function registerCustomFontFile(
  slot: 'ui' | 'mono',
  file: File,
): Promise<string> {
  if (file.size > MAX_CUSTOM_FONT_BYTES) {
    throw new Error('Font file must be under 3 MB (.woff2, .ttf, or .otf)')
  }
  const family = deriveFontNameFromFilename(file.name)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read font file'))
    reader.readAsDataURL(file)
  })
  await injectFontFace(family, dataUrl)
  const saved = readSavedFonts()
  saved[slot] = { family, dataUrl }
  writeSavedFonts(saved)
  return family
}

export function clearSavedCustomFontFile(slot: 'ui' | 'mono') {
  const saved = readSavedFonts()
  delete saved[slot]
  writeSavedFonts(saved)
}

export async function queryInstalledSystemFonts(): Promise<string[]> {
  const api = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> })
    .queryLocalFonts
  if (typeof api !== 'function') return []
  const list = await api()
  const unique = new Set<string>()
  for (const item of list) {
    const clean = sanitizeFontFamilyName(item.family || '')
    if (clean) unique.add(clean)
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b))
}
