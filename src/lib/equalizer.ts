export type EqCategory =
  | 'all'
  | 'reference'
  | 'bass'
  | 'vocals'
  | 'genres'
  | 'custom'

export interface EqBandMeta {
  freq: number
  label: string
  region: 'bass' | 'mid' | 'treble'
  type: BiquadFilterType
}

export const EQ_BANDS: EqBandMeta[] = [
  { freq: 32, label: '32', region: 'bass', type: 'lowshelf' },
  { freq: 64, label: '64', region: 'bass', type: 'peaking' },
  { freq: 125, label: '125', region: 'bass', type: 'peaking' },
  { freq: 250, label: '250', region: 'bass', type: 'peaking' },
  { freq: 500, label: '500', region: 'mid', type: 'peaking' },
  { freq: 1000, label: '1K', region: 'mid', type: 'peaking' },
  { freq: 2000, label: '2K', region: 'mid', type: 'peaking' },
  { freq: 4000, label: '4K', region: 'treble', type: 'peaking' },
  { freq: 8000, label: '8K', region: 'treble', type: 'peaking' },
  { freq: 16000, label: '16K', region: 'treble', type: 'highshelf' },
]

export const EQ_MIN_DB = -12
export const EQ_MAX_DB = 12
export const EQ_STEP_DB = 0.5

export interface EqPreset {
  id: string
  name: string
  tagline: string
  category: Exclude<EqCategory, 'all'>
  bands: number[]
  preamp?: number
  custom?: boolean
}

export const EQ_CATEGORIES: { id: EqCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'reference', label: 'Reference' },
  { id: 'bass', label: 'Bass & Energy' },
  { id: 'vocals', label: 'Vocals & Clarity' },
  { id: 'genres', label: 'Genres' },
  { id: 'custom', label: 'Custom' },
]

export const BUILTIN_EQ_PRESETS: EqPreset[] = [
  // Reference
  {
    id: 'flat',
    name: 'Flat',
    tagline: 'Pure studio neutral',
    category: 'reference',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preamp: 0,
  },
  {
    id: 'studio',
    name: 'Studio Reference',
    tagline: 'Tight sub & crisp air',
    category: 'reference',
    bands: [1.5, 1, 0, -0.5, 0, 0.5, 1.5, 2, 1.5, 1],
    preamp: -0.5,
  },
  {
    id: 'late-night',
    name: 'Late Night',
    tagline: 'Warm low-volume comfort',
    category: 'reference',
    bands: [3, 2, 1, 0, -0.5, -1, -1.5, -2.5, -3.5, -4],
    preamp: 0,
  },
  {
    id: 'headphones',
    name: 'Headphone Stage',
    tagline: 'Natural stereo presence',
    category: 'reference',
    bands: [2, 1.5, 0.5, -1, 0, 1, 2, 1.5, 2.5, 2],
    preamp: -1,
  },

  // Bass & Energy
  {
    id: 'bass-boost',
    name: 'Bass Boost',
    tagline: 'Full punchy low-end',
    category: 'bass',
    bands: [6, 5, 3.5, 1.5, 0, 0, 0.5, 1, 1.5, 1],
    preamp: -2.5,
  },
  {
    id: 'deep-sub',
    name: 'Deep Sub',
    tagline: 'Focused sub-bass weight',
    category: 'bass',
    bands: [7.5, 5.5, 2, -0.5, -1, 0, 0.5, 1, 1.5, 2],
    preamp: -3,
  },
  {
    id: 'electronic',
    name: 'Electronic',
    tagline: 'Driving sub & bright synth',
    category: 'bass',
    bands: [5, 4, 1.5, -0.5, -1.5, 0.5, 1.5, 2.5, 4, 4.5],
    preamp: -2.5,
  },
  {
    id: 'hip-hop',
    name: 'Hip-Hop',
    tagline: 'Heavy kick & vocal snap',
    category: 'bass',
    bands: [5.5, 4.5, 2, 0.5, -1, -0.5, 1.5, 2, 2.5, 3],
    preamp: -2.5,
  },

  // Vocals & Clarity
  {
    id: 'vocal-boost',
    name: 'Vocal Boost',
    tagline: 'Forward intimate voices',
    category: 'vocals',
    bands: [-2, -1.5, -0.5, 1, 3, 4.5, 4, 2.5, 1, 0],
    preamp: -1.5,
  },
  {
    id: 'podcast',
    name: 'Podcast & Speech',
    tagline: 'Clear intelligible dialogue',
    category: 'vocals',
    bands: [-4.5, -3.5, -1, 1, 3.5, 5, 4.5, 2, -1, -2.5],
    preamp: -1.5,
  },
  {
    id: 'treble-air',
    name: 'Treble Air',
    tagline: 'Sparkle & micro-detail',
    category: 'vocals',
    bands: [-1, -0.5, 0, 0, 0.5, 1.5, 3, 4.5, 5.5, 6],
    preamp: -2,
  },

  // Genres
  {
    id: 'acoustic',
    name: 'Acoustic',
    tagline: 'Warm timber & strings',
    category: 'genres',
    bands: [1.5, 1, 0.5, 1.5, 2, 1, 1.5, 2.5, 2, 1.5],
    preamp: -1,
  },
  {
    id: 'rock',
    name: 'Rock',
    tagline: 'Crunchy guitars & snare',
    category: 'genres',
    bands: [4, 3, 1.5, -1, -1.5, 0.5, 2.5, 3.5, 3.5, 2.5],
    preamp: -2,
  },
  {
    id: 'jazz',
    name: 'Jazz',
    tagline: 'Upright bass & brass',
    category: 'genres',
    bands: [2.5, 2, 1, 1.5, -1, -1, 0, 1.5, 2.5, 3],
    preamp: -1,
  },
  {
    id: 'classical',
    name: 'Classical',
    tagline: 'Wide orchestral air',
    category: 'genres',
    bands: [2, 1.5, 0.5, 0, -0.5, -0.5, 0, 2, 3, 4],
    preamp: -1.5,
  },
  {
    id: 'lofi',
    name: 'Lo-Fi Tape',
    tagline: 'Soft analog warmth',
    category: 'genres',
    bands: [3, 2.5, 1.5, 1, 0, -1, -2.5, -4, -5.5, -6.5],
    preamp: -1,
  },
]

export interface EqSettings {
  enabled: boolean
  preamp: number
  limiter: boolean
  presetId: string | null
  bands: number[]
  customPresets: EqPreset[]
}

export const DEFAULT_EQ_SETTINGS: EqSettings = {
  enabled: false,
  preamp: 0,
  limiter: true,
  presetId: 'flat',
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  customPresets: [],
}

const STORAGE_KEY = 'zuno:equalizer:v1'

export function clampDb(v: number): number {
  const rounded = Math.round(v / EQ_STEP_DB) * EQ_STEP_DB
  return Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, rounded))
}

export function formatDb(v: number): string {
  const n = Math.abs(v) < 0.05 ? 0 : v
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}`
}

export function loadEqSettings(): EqSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_EQ_SETTINGS
    const parsed = JSON.parse(raw)
    const bands =
      Array.isArray(parsed?.bands) && parsed.bands.length === EQ_BANDS.length
        ? parsed.bands.map((n: unknown) =>
            typeof n === 'number' && Number.isFinite(n) ? clampDb(n) : 0,
          )
        : [...DEFAULT_EQ_SETTINGS.bands]
    const customPresets: EqPreset[] = Array.isArray(parsed?.customPresets)
      ? parsed.customPresets
          .filter(
            (p: unknown): p is EqPreset =>
              Boolean(p) &&
              typeof p === 'object' &&
              typeof (p as EqPreset).id === 'string' &&
              typeof (p as EqPreset).name === 'string' &&
              Array.isArray((p as EqPreset).bands) &&
              (p as EqPreset).bands.length === EQ_BANDS.length,
          )
          .map((p: EqPreset) => ({
            ...p,
            category: 'custom' as const,
            custom: true,
            bands: p.bands.map((n) => clampDb(Number(n) || 0)),
            preamp: clampDb(Number(p.preamp) || 0),
          }))
      : []

    return {
      enabled: Boolean(parsed?.enabled),
      preamp:
        typeof parsed?.preamp === 'number' && Number.isFinite(parsed.preamp)
          ? clampDb(parsed.preamp)
          : 0,
      limiter: typeof parsed?.limiter === 'boolean' ? parsed.limiter : true,
      presetId: typeof parsed?.presetId === 'string' ? parsed.presetId : null,
      bands,
      customPresets,
    }
  } catch {
    return DEFAULT_EQ_SETTINGS
  }
}

export function saveEqSettings(settings: EqSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function findActivePreset(settings: EqSettings): EqPreset | null {
  if (!settings.presetId) return null
  return (
    BUILTIN_EQ_PRESETS.find((p) => p.id === settings.presetId) ??
    settings.customPresets.find((p) => p.id === settings.presetId) ??
    null
  )
}

/**
 * Generates a smooth Catmull-Rom cubic Bezier SVG path through the 10 EQ band values.
 */
export function buildEqSplinePath(
  bands: number[],
  width: number,
  height: number,
  padX = 16,
  padY = 14,
): { line: string; area: string; points: { x: number; y: number }[] } {
  const usableW = Math.max(1, width - padX * 2)
  const usableH = Math.max(1, height - padY * 2)
  const count = bands.length

  const points = bands.map((db, idx) => {
    const x = padX + (count > 1 ? (idx / (count - 1)) * usableW : usableW / 2)
    const norm = (EQ_MAX_DB - db) / (EQ_MAX_DB - EQ_MIN_DB)
    const y = padY + norm * usableH
    return { x, y }
  })

  if (points.length === 0) return { line: '', area: '', points }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  const tension = 0.22

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = Math.max(padY, Math.min(height - padY, p1.y + (p2.y - p0.y) * tension))
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = Math.max(padY, Math.min(height - padY, p2.y - (p3.y - p1.y) * tension))

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }

  const zeroY = padY + usableH / 2
  const last = points[points.length - 1]
  const first = points[0]
  const area = `${d} L ${last.x.toFixed(2)} ${zeroY.toFixed(2)} L ${first.x.toFixed(2)} ${zeroY.toFixed(2)} Z`

  return { line: d, area, points }
}

/* --------------------------------------------------------------------------
 * Real-time Web Audio API 10-band Equalizer DSP Engine
 * -------------------------------------------------------------------------- */

interface EqAudioGraph {
  ctx: AudioContext
  source: MediaElementAudioSourceNode
  preamp: GainNode
  filters: BiquadFilterNode[]
  limiter: DynamicsCompressorNode
  analyser: AnalyserNode
  limiterConnected: boolean
}

const audioGraphs = new WeakMap<HTMLAudioElement, EqAudioGraph>()

function getOrCreateGraph(audio: HTMLAudioElement): EqAudioGraph | null {
  const existing = audioGraphs.get(audio)
  if (existing) return existing

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioCtx) return null

  try {
    const ctx = new AudioCtx()
    const source = ctx.createMediaElementSource(audio)
    const preamp = ctx.createGain()
    preamp.gain.value = 1

    const filters = EQ_BANDS.map((band) => {
      const filter = ctx.createBiquadFilter()
      filter.type = band.type
      filter.frequency.value = band.freq
      if (band.type === 'peaking') {
        filter.Q.value = 1.4
      }
      filter.gain.value = 0
      return filter
    })

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -1.5
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.15

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.82

    // Chain: source -> preamp -> filters[0..9] -> limiter -> analyser -> destination
    source.connect(preamp)
    let node: AudioNode = preamp
    for (const f of filters) {
      node.connect(f)
      node = f
    }
    node.connect(limiter)
    limiter.connect(analyser)
    analyser.connect(ctx.destination)

    const graph: EqAudioGraph = {
      ctx,
      source,
      preamp,
      filters,
      limiter,
      analyser,
      limiterConnected: true,
    }
    audioGraphs.set(audio, graph)
    return graph
  } catch {
    return null
  }
}

export function resumeEqualizerContext(audio: HTMLAudioElement | null): void {
  if (!audio) return
  const graph = audioGraphs.get(audio)
  if (graph && graph.ctx.state === 'suspended') {
    graph.ctx.resume().catch(() => {})
  }
}

export function applyEqualizerToAudio(
  audio: HTMLAudioElement | null,
  settings: EqSettings,
  forceAttach = false,
): void {
  if (!audio) return
  const existing = audioGraphs.get(audio)
  // Stay zero-overhead until EQ is enabled or explicitly attached (e.g., on Equalizer page)
  if (!existing && !settings.enabled && !forceAttach) return

  const graph = getOrCreateGraph(audio)
  if (!graph) return

  const now = graph.ctx.currentTime
  const tc = 0.025

  const targetPreampLinear = settings.enabled
    ? Math.pow(10, settings.preamp / 20)
    : 1
  graph.preamp.gain.setTargetAtTime(targetPreampLinear, now, tc)

  graph.filters.forEach((filter, idx) => {
    const db = settings.enabled ? (settings.bands[idx] ?? 0) : 0
    filter.gain.setTargetAtTime(db, now, tc)
  })

  // Toggle limiter node routing cleanly when setting changes
  const wantLimiter = settings.enabled && settings.limiter
  if (wantLimiter !== graph.limiterConnected) {
    const lastFilter = graph.filters[graph.filters.length - 1]
    try {
      lastFilter.disconnect()
      graph.limiter.disconnect()
      if (wantLimiter) {
        lastFilter.connect(graph.limiter)
        graph.limiter.connect(graph.analyser)
      } else {
        lastFilter.connect(graph.analyser)
      }
      graph.limiterConnected = wantLimiter
    } catch {
      /* ignore routing edge */
    }
  }
}

export function readSpectrumData(
  audio: HTMLAudioElement | null,
  buffer: Uint8Array<ArrayBuffer>,
): boolean {
  if (!audio) return false
  const graph = audioGraphs.get(audio)
  if (!graph || graph.ctx.state !== 'running') return false
  graph.analyser.getByteFrequencyData(buffer)
  return true
}
