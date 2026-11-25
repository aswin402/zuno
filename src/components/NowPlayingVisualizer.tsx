import { useEffect, useRef } from 'react'
import { parseCssColorToRgb, type Rgb } from '@/lib/color'
import { readSpectrumData } from '@/lib/equalizer'
import { cn } from '@/lib/utils'
import { isTauriRuntime, zunoApi, type AudioLevels } from '@/lib/zunoApi'
import type {
  ThemeMode,
  VisualizerColorId,
  VisualizerIntensityId,
  VisualizerStyleId,
} from '@/lib/appearance'

interface NowPlayingVisualizerProps {
  styleVariant: VisualizerStyleId
  colorMode: VisualizerColorId
  intensity: VisualizerIntensityId
  mode: ThemeMode
  isPlaying: boolean
  audioEl?: HTMLAudioElement | null
  /** Demo mode for Customize Studio previews (synthesizes lively musical groove). */
  demo?: boolean
  /** Incrementing counter that injects a crisp sub-bass kick pulse (used in Studio preview). */
  kickPulse?: number
  className?: string
}

interface PaletteRgb {
  primary: Rgb
  fg: Rgb
  bass: Rgb
  mid: Rgb
  treble: Rgb
}

interface Ripple {
  r: number
  alpha: number
  speed: number
}

const BANDS = 24
const WEB_FREQ_LEN = 64
const WEB_BIN_INDICES = Uint8Array.from({ length: BANDS }, (_, i) =>
  Math.min(
    WEB_FREQ_LEN - 1,
    Math.floor(Math.pow(i / (BANDS - 1), 1.45) * (WEB_FREQ_LEN - 2)) + 1,
  ),
)
const FLUID_ENV_SMALL = Float32Array.from({ length: 97 }, (_, i) =>
  Math.pow(Math.sin((i / 96) * Math.PI), 1.55),
)
const FLUID_ENV_LARGE = Float32Array.from({ length: 161 }, (_, i) =>
  Math.pow(Math.sin((i / 160) * Math.PI), 1.55),
)
const INTENSITY_GAIN: Record<VisualizerIntensityId, number> = {
  subtle: 0.68,
  balanced: 1.0,
  dynamic: 1.42,
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t))
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]
}

function readPalette(colorMode: VisualizerColorId, mode: ThemeMode): PaletteRgb {
  const cs = getComputedStyle(document.documentElement)
  const fallbackFg: Rgb = mode === 'light' ? [15, 15, 18] : [250, 250, 250]
  const primary = parseCssColorToRgb(cs.getPropertyValue('--primary'), fallbackFg)
  const fg = parseCssColorToRgb(cs.getPropertyValue('--foreground'), fallbackFg)

  if (colorMode === 'mono') {
    return {
      primary: fg,
      fg,
      bass: fg,
      mid: mixRgb(fg, primary, 0.2),
      treble: fg,
    }
  }

  if (colorMode === 'spectrum') {
    return mode === 'light'
      ? {
          primary,
          fg,
          bass: [234, 88, 41],
          mid: [99, 102, 241],
          treble: [14, 165, 233],
        }
      : {
          primary,
          fg,
          bass: [249, 115, 22],
          mid: [129, 140, 248],
          treble: [56, 189, 248],
        }
  }

  return {
    primary,
    fg,
    bass: primary,
    mid: mixRgb(primary, fg, 0.35),
    treble: mixRgb(primary, fg, 0.65),
  }
}

/** Synthesizes a musical beat + vocal + shimmer groove for Studio preview or web fallback. */
function synthGroove(tSec: number, outBands: Float32Array): {
  bass: number
  mid: number
  treble: number
  energy: number
} {
  const beatPhase = (tSec * (118 / 60)) % 1
  const kick = Math.pow(Math.max(0, 1 - beatPhase * 3.4), 2.2)
  const offBeat = Math.pow(Math.max(0, 1 - (((beatPhase + 0.5) % 1) * 4.5)), 2.5) * 0.45
  const bass = Math.min(1, 0.22 + kick * 0.68 + offBeat * 0.22)
  const mid = Math.min(
    1,
    0.2 + 0.26 * (0.5 + 0.5 * Math.sin(tSec * 2.7)) + 0.16 * (0.5 + 0.5 * Math.sin(tSec * 5.9 + 1.1)),
  )
  const treble = Math.min(
    1,
    0.14 + 0.22 * (0.5 + 0.5 * Math.sin(tSec * 8.3 + 0.4)) + offBeat * 0.32,
  )

  for (let i = 0; i < BANDS; i++) {
    const f = i / (BANDS - 1)
    const wave =
      0.5 + 0.5 * Math.sin(tSec * (3.2 + i * 0.45) + i * 0.72) * Math.cos(tSec * 1.4 - i * 0.35)
    const lowW = Math.max(0, 1 - f * 2.4)
    const midW = Math.max(0, 1 - Math.abs(f - 0.48) * 2.6)
    const hiW = Math.max(0, (f - 0.52) * 2.1)
    outBands[i] = Math.min(1, lowW * bass * 0.95 + midW * mid * 0.9 + hiW * treble * 0.85 + wave * 0.14)
  }

  return {
    bass,
    mid,
    treble,
    energy: Math.min(1, bass * 0.45 + mid * 0.35 + treble * 0.2),
  }
}

/**
 * Real-time audio-reactive Now Playing visualizer.
 *
 * - Native desktop (Tauri): reads real 1024-pt Rust FFT telemetry (`zunoApi.audioLevels()`).
 * - Web / Mobile browser: reads real Web Audio `AnalyserNode` spectrum (`readSpectrumData`).
 * - Calm visible idle state when paused (never vanishes, redraws crisply on resize/theme change,
 *   and pauses its rAF loop once settled so paused = 0% CPU/GPU).
 * - Strictly unclipped floating visuals (zero rectangular glow edges, zero card borders).
 */
export function NowPlayingVisualizer({
  styleVariant,
  colorMode,
  intensity,
  mode,
  isPlaying,
  audioEl = null,
  demo = false,
  kickPulse = 0,
  className,
}: NowPlayingVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPlayingRef = useRef(isPlaying)
  const kickBoostRef = useRef(0)
  const wakeRef = useRef<(() => void) | null>(null)

  isPlayingRef.current = isPlaying

  useEffect(() => {
    wakeRef.current?.()
  }, [isPlaying])

  useEffect(() => {
    if (kickPulse > 0) {
      kickBoostRef.current = 1.0
      wakeRef.current?.()
    }
  }, [kickPulse])

  useEffect(() => {
    if (styleVariant === 'none') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let pollTimer: number | undefined
    let disposed = false
    let pollInFlight = false
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = 320
    let height = 160

    let palette = readPalette(colorMode, mode)
    const gain = INTENSITY_GAIN[intensity]
    const isNative = !demo && isTauriRuntime()

    const targetBands = new Float32Array(BANDS)
    const smoothBands = new Float32Array(BANDS)
    const peaks = new Float32Array(64)
    const webFreqBuf = new Uint8Array(new ArrayBuffer(64))
    let targetBass = 0
    let targetMid = 0
    let targetTreble = 0
    let targetEnergy = 0
    let sBass = 0
    let sMid = 0
    let sTreble = 0
    let sEnergy = 0
    let activity = isPlayingRef.current ? 1 : 0
    let prevBass = 0
    let phase = 0.6
    const ripples: Ripple[] = []
    let lastTs = performance.now()
    let hasNativeSignal = false

    const applyNativeLevels = (lvl: AudioLevels | null) => {
      if (!lvl) return
      const len = Math.min(BANDS, lvl.bands.length)
      for (let i = 0; i < len; i++) {
        targetBands[i] = lvl.bands[i] ?? 0
      }
      targetBass = lvl.bass
      targetMid = lvl.mid
      targetTreble = lvl.treble
      targetEnergy = lvl.energy
      if (lvl.energy > 0.005 || lvl.bass > 0.005) {
        hasNativeSignal = true
      }
    }

    const startPollingIfNeeded = () => {
      if (!isNative || pollTimer !== undefined || !isPlayingRef.current) return
      const poll = () => {
        if (disposed || document.hidden || pollInFlight || !isPlayingRef.current) return
        pollInFlight = true
        zunoApi
          .audioLevels()
          .then((lvl) => {
            if (!disposed && isPlayingRef.current) applyNativeLevels(lvl)
          })
          .finally(() => {
            pollInFlight = false
          })
      }
      poll()
      pollTimer = window.setInterval(poll, 33)
    }

    const stopPolling = () => {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer)
        pollTimer = undefined
      }
    }

    const drawOrb = (t: number) => {
      const cx = width * 0.5
      const cy = height * 0.5
      const minDim = Math.min(width, height)
      // Keep orb + full feathered glow strictly inside 48% of minDim -> ZERO clipped square edge!
      const maxRadius = minDim * 0.48
      const baseR = minDim * 0.225
      const restScale = 0.88 + activity * 0.12
      const kickScale = restScale + sBass * 0.24 * gain
      const rCore = Math.min(baseR * kickScale, maxRadius * 0.64)

      // 1. Completely feathered radial glow guaranteed to fade to alpha 0 BEFORE canvas boundary
      const auraR = Math.min(rCore * (1.85 + sEnergy * 0.25), maxRadius)
      const auraGrad = ctx.createRadialGradient(cx, cy, rCore * 0.25, cx, cy, auraR)
      const glowAlpha = 0.11 + activity * 0.1 + sBass * 0.18
      auraGrad.addColorStop(0, rgba(palette.bass, glowAlpha))
      auraGrad.addColorStop(0.48, rgba(palette.mid, glowAlpha * 0.36))
      auraGrad.addColorStop(0.8, rgba(palette.treble, glowAlpha * 0.07))
      auraGrad.addColorStop(1, rgba(palette.treble, 0))
      ctx.fillStyle = auraGrad
      ctx.beginPath()
      ctx.arc(cx, cy, auraR, 0, Math.PI * 2)
      ctx.fill()

      // 2. Expanding bass shockwave ripples (smoothly fade to 0 before reaching canvas edge)
      const rippleStrokeW = Math.max(1.35, minDim * 0.005)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        const edgeFade = Math.max(0, 1 - rp.r / (maxRadius * 0.98))
        const a = rp.alpha * edgeFade
        if (a <= 0.005) continue
        ctx.strokeStyle = rgba(palette.primary, a)
        ctx.lineWidth = rippleStrokeW
        ctx.beginPath()
        ctx.arc(cx, cy, rp.r, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 3. Three organic harmonic Fourier-deformed fluid shells (settle to calm sphere when idle)
      const shells = [
        { scale: 1.2, amp: 0.2, speed: 0.75, alpha: 0.16, color: palette.treble, bandOffset: 10 },
        { scale: 1.07, amp: 0.16, speed: -1.1, alpha: 0.28, color: palette.mid, bandOffset: 4 },
        { scale: 0.94, amp: 0.12, speed: 1.5, alpha: 0.88, color: palette.bass, bandOffset: 0 },
      ]

      const pts = minDim > 260 ? 96 : 56
      for (let s = 0; s < shells.length; s++) {
        const sh = shells[s]
        ctx.beginPath()
        for (let i = 0; i <= pts; i++) {
          const idx = i % pts
          const a = (idx / pts) * Math.PI * 2
          const bIdx = (Math.floor((idx / pts) * 12) + sh.bandOffset) % BANDS
          const bandVal = smoothBands[bIdx] * gain
          const harmonic =
            activity *
            (Math.sin(a * 3 + t * sh.speed * 1.4) * (0.032 + bandVal * sh.amp) +
              Math.cos(a * 5 - t * sh.speed * 0.9) * (0.02 + sTreble * 0.07 * gain))
          const rad = Math.min(maxRadius * 0.92, rCore * sh.scale * (1 + harmonic))
          const x = cx + Math.cos(a) * rad
          const y = cy + Math.sin(a) * rad
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()

        if (s === 2) {
          const coreGrad = ctx.createRadialGradient(
            cx - rCore * 0.2,
            cy - rCore * 0.22,
            rCore * 0.08,
            cx,
            cy,
            rCore * 1.1,
          )
          const coreOp = 0.62 + activity * 0.34
          coreGrad.addColorStop(0, rgba(palette.fg, coreOp))
          coreGrad.addColorStop(0.5, rgba(palette.bass, 0.5 + activity * 0.32))
          coreGrad.addColorStop(1, rgba(palette.mid, 0.18 + activity * 0.16))
          ctx.fillStyle = coreGrad
          ctx.fill()
          ctx.strokeStyle = rgba(palette.primary, 0.32 + activity * 0.22 + sBass * 0.3)
          ctx.lineWidth = Math.max(1.15, minDim * 0.0045)
          ctx.stroke()
        } else {
          ctx.fillStyle = rgba(sh.color, sh.alpha * (0.45 + activity * 0.35 + sEnergy * 0.45))
          ctx.fill()
          ctx.strokeStyle = rgba(sh.color, sh.alpha * (0.65 + activity * 0.55))
          ctx.lineWidth = Math.max(0.9, minDim * 0.0034)
          ctx.stroke()
        }
      }
    }

    const drawWaveBars = (dt: number) => {
      const rawBars = Math.max(22, Math.min(64, Math.round(width / 15)))
      const barCount = rawBars & ~1 // always even for symmetrical center mirror
      const half = barCount / 2
      const padX = Math.max(12, width * 0.05)
      const usableW = width - padX * 2
      const gap = Math.max(2.5, Math.min(8, usableW / (barCount * 2.6)))
      const barW = Math.max(2.5, (usableW - gap * (barCount - 1)) / barCount)
      const baselineY = height * 0.7
      const maxH = height * 0.6
      // Frame-rate-independent peak fall (identical visual speed on 60Hz, 120Hz, 144Hz monitors)
      const peakFall = Math.max(52, height * 0.34) * dt
      const dotGap = Math.max(5, height * 0.025)
      const dotR = Math.max(1.3, Math.min(4.2, barW * 0.34))
      const presence = 0.42 + activity * 0.58

      // Shared vertical gradients (2 allocations per frame instead of 128!)
      const barGrad = ctx.createLinearGradient(0, baselineY - maxH, 0, baselineY)
      barGrad.addColorStop(0, rgba(palette.fg, 0.92 * presence))
      barGrad.addColorStop(0.42, rgba(palette.bass, 0.85 * presence))
      barGrad.addColorStop(0.76, rgba(palette.mid, 0.68 * presence))
      barGrad.addColorStop(1, rgba(palette.treble, 0.25 * presence))

      const refMaxH = Math.max(4, height - baselineY - 4)
      const refGrad = ctx.createLinearGradient(0, baselineY + 3, 0, baselineY + 3 + refMaxH)
      refGrad.addColorStop(0, rgba(palette.mid, 0.22 * presence))
      refGrad.addColorStop(1, rgba(palette.mid, 0))

      for (let i = 0; i < barCount; i++) {
        const distFromCenter = Math.abs(i - (half - 0.5)) / half
        const bandF = distFromCenter * (BANDS - 1)
        const b0 = Math.floor(bandF)
        const b1 = Math.min(BANDS - 1, b0 + 1)
        const frac = bandF - b0
        const raw = smoothBands[b0] * (1 - frac) + smoothBands[b1] * frac
        const shaped = Math.min(1, Math.pow(raw * gain, 0.92))

        // Calm symmetrical resting silhouette when paused so bars never vanish
        const idleCurve = Math.exp(-distFromCenter * distFromCenter * 3.4)
        const idleH = Math.max(4, (5 + idleCurve * 15) * Math.min(2.2, height / 130))
        const activeH = Math.max(idleH, shaped * maxH)
        const h = idleH + (activeH - idleH) * Math.max(activity, shaped)

        if (h > peaks[i]) {
          peaks[i] = h
        } else {
          peaks[i] = Math.max(h, peaks[i] - peakFall)
        }

        const x = padX + i * (barW + gap)

        ctx.fillStyle = barGrad
        ctx.beginPath()
        ctx.roundRect(x, baselineY - h, barW, h, barW * 0.5)
        ctx.fill()

        // Soft floor reflection
        const refH = Math.min(refMaxH, h * 0.34)
        if (refH > 2) {
          ctx.fillStyle = refGrad
          ctx.beginPath()
          ctx.roundRect(x, baselineY + 3, barW, refH, barW * 0.5)
          ctx.fill()
        }

        // Peak-hold micro dot (visible while active/settling)
        if (peaks[i] > idleH + 2) {
          ctx.fillStyle = rgba(palette.primary, 0.82 * Math.min(1, (peaks[i] - idleH) / 8))
          ctx.beginPath()
          ctx.arc(x + barW * 0.5, baselineY - peaks[i] - dotGap, dotR, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const drawFluidWave = (t: number) => {
      const cy = height * 0.52
      const maxAmp = height * 0.36
      const envLut = width > 640 ? FLUID_ENV_LARGE : FLUID_ENV_SMALL
      const steps = envLut.length - 1
      const presence = 0.45 + activity * 0.55
      const strokeScale = Math.max(1, Math.min(1.65, height / 190))
      const idleScale = Math.max(1, Math.min(2.1, height / 180))

      const ribbons = [
        {
          amp: Math.max(
            5.5 * idleScale,
            (0.14 + sBass * 0.9 * gain) * maxAmp * activity + 5.5 * idleScale * (1 - activity),
          ),
          freq: 2.2,
          speed: 2.1,
          fill: true,
          alpha: 0.2 * presence,
          strokeAlpha: 0.82 * presence,
          width: 2.1 * strokeScale,
          color: palette.bass,
        },
        {
          amp: Math.max(
            3.5 * idleScale,
            (0.1 + sMid * 0.76 * gain) * maxAmp * activity + 3.5 * idleScale * (1 - activity),
          ),
          freq: 3.4,
          speed: -2.8,
          fill: true,
          alpha: 0.12 * presence,
          strokeAlpha: 0.6 * presence,
          width: 1.6 * strokeScale,
          color: palette.mid,
        },
        {
          amp: (0.06 + sTreble * 0.62 * gain) * maxAmp * activity + 1.5 * idleScale * (1 - activity),
          freq: 5.4,
          speed: 4.0,
          fill: false,
          alpha: 0,
          strokeAlpha: 0.5 * presence,
          width: 1.2 * strokeScale,
          color: palette.treble,
        },
      ]

      // Subtle center acoustic baseline
      ctx.strokeStyle = rgba(palette.fg, 0.12)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(width * 0.04, cy)
      ctx.lineTo(width * 0.96, cy)
      ctx.stroke()

      for (const rib of ribbons) {
        ctx.beginPath()
        for (let i = 0; i <= steps; i++) {
          const u = i / steps
          const x = u * width
          const env = envLut[i]
          const bIdx = Math.min(BANDS - 1, Math.floor(u * BANDS))
          const localMod = 0.7 + smoothBands[bIdx] * 0.65 * activity
          const y =
            cy +
            Math.sin(u * Math.PI * 2 * rib.freq + t * rib.speed) *
              rib.amp *
              env *
              localMod
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = rgba(rib.color, rib.strokeAlpha)
        ctx.lineWidth = rib.width
        ctx.stroke()

        if (rib.fill) {
          ctx.lineTo(width, cy)
          ctx.lineTo(0, cy)
          ctx.closePath()
          const fgGrad = ctx.createLinearGradient(0, cy - rib.amp, 0, cy + rib.amp)
          fgGrad.addColorStop(0, rgba(rib.color, rib.alpha))
          fgGrad.addColorStop(0.5, rgba(rib.color, rib.alpha * 0.35))
          fgGrad.addColorStop(1, rgba(rib.color, rib.alpha))
          ctx.fillStyle = fgGrad
          ctx.fill()
        }
      }
    }

    const drawRadialRing = (t: number) => {
      const cx = width * 0.5
      const cy = height * 0.5
      const minDim = Math.min(width, height)
      const maxRadius = minDim * 0.47
      const innerR = minDim * (0.21 + sBass * 0.048 * gain)
      const gapFromRing = Math.max(4, minDim * 0.022)
      const maxBarLen = Math.max(8, maxRadius - innerR - gapFromRing - 6)
      const rays = minDim > 260 ? 64 : 48
      const presence = 0.48 + activity * 0.52

      // Soft central core glow (strictly inside ring)
      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, innerR * 1.15)
      coreGrad.addColorStop(0, rgba(palette.bass, (0.16 + sBass * 0.24) * presence))
      coreGrad.addColorStop(1, rgba(palette.bass, 0))
      ctx.fillStyle = coreGrad
      ctx.beginPath()
      ctx.arc(cx, cy, innerR * 1.15, 0, Math.PI * 2)
      ctx.fill()

      // Inner acoustic ring
      ctx.strokeStyle = rgba(palette.primary, (0.42 + sBass * 0.42) * presence)
      ctx.lineWidth = Math.max(1.4, minDim * 0.0055)
      ctx.beginPath()
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
      ctx.stroke()

      // Mirrored radial rays (calm resting ticks when paused)
      ctx.lineCap = 'round'
      const rayWidth = Math.max(1.7, Math.min(4.2, minDim * 0.0115))
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2 - Math.PI / 2 + t * 0.16
        const mirrorIdx = i < rays / 2 ? i : rays - 1 - i
        const bIdx = Math.min(BANDS - 1, Math.floor((mirrorIdx / (rays / 2)) * BANDS))
        const v = Math.min(1, smoothBands[bIdx] * gain)
        const idleLen = Math.max(3.5, minDim * 0.022) + (i % 2 === 0 ? Math.max(2, minDim * 0.012) : 0)
        const len = Math.min(maxBarLen, idleLen + v * (maxBarLen - idleLen))

        const x0 = cx + Math.cos(angle) * (innerR + gapFromRing)
        const y0 = cy + Math.sin(angle) * (innerR + gapFromRing)
        const x1 = cx + Math.cos(angle) * (innerR + gapFromRing + len)
        const y1 = cy + Math.sin(angle) * (innerR + gapFromRing + len)

        const c = mixRgb(palette.bass, palette.treble, mirrorIdx / (rays / 2))
        ctx.strokeStyle = rgba(c, (0.36 + v * 0.62) * presence)
        ctx.lineWidth = rayWidth
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }

      // Orbiting micro-satellite (strictly inside canvas bounds)
      const orbitR = Math.min(maxRadius - 3, innerR + gapFromRing + maxBarLen * 0.68 + 4)
      const orbitA = t * (1.1 + sTreble * 1.5)
      ctx.fillStyle = rgba(palette.fg, 0.78 * presence)
      ctx.beginPath()
      ctx.arc(
        cx + Math.cos(orbitA) * orbitR,
        cy + Math.sin(orbitA) * orbitR,
        Math.max(2.2, Math.min(4.5, minDim * 0.01)),
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }

    const drawAuroraPulse = (t: number) => {
      const cx = width * 0.5
      const cy = height * 0.44
      const minDim = Math.min(width, height)
      const presence = 0.42 + activity * 0.58

      const clouds = [
        {
          x: cx + Math.cos(t * 0.45) * width * 0.12,
          y: cy + Math.sin(t * 0.35) * height * 0.07,
          r: minDim * (0.4 + sBass * 0.16 * gain),
          color: palette.bass,
          alpha: (0.09 + sBass * 0.15 * gain) * presence,
        },
        {
          x: cx - Math.cos(t * 0.38 + 1.4) * width * 0.14,
          y: cy - Math.sin(t * 0.5 + 0.8) * height * 0.08,
          r: minDim * (0.33 + sMid * 0.13 * gain),
          color: palette.mid,
          alpha: (0.07 + sMid * 0.11 * gain) * presence,
        },
        {
          x: cx + Math.sin(t * 0.62) * width * 0.1,
          y: cy + Math.cos(t * 0.42) * height * 0.09,
          r: minDim * (0.28 + sTreble * 0.11 * gain),
          color: palette.treble,
          alpha: (0.05 + sTreble * 0.09 * gain) * presence,
        },
      ]

      for (const cl of clouds) {
        const g = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r)
        g.addColorStop(0, rgba(cl.color, Math.min(0.28, cl.alpha)))
        g.addColorStop(0.65, rgba(cl.color, Math.min(0.08, cl.alpha * 0.3)))
        g.addColorStop(1, rgba(cl.color, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const rp of ripples) {
        const edgeFade = Math.max(0, 1 - rp.r / (minDim * 0.48))
        if (edgeFade <= 0.01) continue
        ctx.strokeStyle = rgba(palette.primary, rp.alpha * 0.42 * edgeFade)
        ctx.lineWidth = 1.15
        ctx.beginPath()
        ctx.arc(cx, cy, rp.r, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    const sceneRenderers: Record<Exclude<VisualizerStyleId, 'none'>, (t: number, dt: number) => void> = {
      orb: (t) => drawOrb(t),
      'wave-bars': (_t, dt) => drawWaveBars(dt),
      'fluid-wave': (t) => drawFluidWave(t),
      'radial-ring': (t) => drawRadialRing(t),
      'aurora-pulse': (t) => drawAuroraPulse(t),
    }

    const drawScene = (t: number, dt = 1 / 60) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      sceneRenderers[styleVariant](t, dt)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
      const nextW = Math.round(rect.width * nextDpr)
      const nextH = Math.round(rect.height * nextDpr)
      dpr = nextDpr
      width = rect.width
      height = rect.height
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW
        canvas.height = nextH
      }
      // Always redraw immediately on resize so idle/paused canvas never blanks out
      drawScene(phase)
    }

    const renderFrame = (now: number) => {
      if (disposed) return
      rafId = 0
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTs) / 1000))
      lastTs = now

      if (document.hidden) {
        if (isPlayingRef.current) {
          rafId = requestAnimationFrame(renderFrame)
        }
        return
      }

      const playing = isPlayingRef.current

      if (playing) {
        startPollingIfNeeded()
        phase += dt * (0.9 + sEnergy * 0.85)
        if (demo) {
          const g = synthGroove(now / 1000, targetBands)
          targetBass = g.bass
          targetMid = g.mid
          targetTreble = g.treble
          targetEnergy = g.energy
        } else if (!isNative) {
          if (readSpectrumData(audioEl, webFreqBuf)) {
            let bSum = 0
            let mSum = 0
            let tSum = 0
            for (let i = 0; i < BANDS; i++) {
              const binIdx = WEB_BIN_INDICES[i]
              const val = Math.min(1, (webFreqBuf[binIdx] / 255) * (1 + (i / BANDS) * 0.45))
              targetBands[i] = val
              if (i < 5) bSum += val
              else if (i < 15) mSum += val
              else tSum += val
            }
            targetBass = Math.min(1, bSum / 5)
            targetMid = Math.min(1, mSum / 10)
            targetTreble = Math.min(1, tSum / 9)
            targetEnergy = Math.min(1, targetBass * 0.45 + targetMid * 0.35 + targetTreble * 0.2)
          } else {
            const g = synthGroove(now / 1000, targetBands)
            targetBass = g.bass * 0.72
            targetMid = g.mid * 0.72
            targetTreble = g.treble * 0.72
            targetEnergy = g.energy * 0.72
          }
        } else if (!hasNativeSignal) {
          targetEnergy = 0.08
          targetBass = 0.08
        }
      } else {
        stopPolling()
        targetBass = 0
        targetMid = 0
        targetTreble = 0
        targetEnergy = 0
        targetBands.fill(0)
      }

      if (kickBoostRef.current > 0.01) {
        const kb = kickBoostRef.current
        targetBass = Math.min(1, targetBass + kb * 0.9)
        targetEnergy = Math.min(1, targetEnergy + kb * 0.6)
        for (let i = 0; i < 7; i++) {
          targetBands[i] = Math.min(1, targetBands[i] + kb * (1 - i / 8))
        }
        kickBoostRef.current *= Math.pow(0.06, dt)
      }

      const atk = 1 - Math.exp(-dt * 24)
      const rel = 1 - Math.exp(-dt * 6.5)
      const lerpAR = (cur: number, tgt: number) => cur + (tgt - cur) * (tgt > cur ? atk : rel)

      const targetActivity = playing || kickBoostRef.current > 0.02 ? 1 : 0
      activity = lerpAR(activity, targetActivity)
      sBass = lerpAR(sBass, targetBass)
      sMid = lerpAR(sMid, targetMid)
      sTreble = lerpAR(sTreble, targetTreble)
      sEnergy = lerpAR(sEnergy, targetEnergy)
      for (let i = 0; i < BANDS; i++) {
        smoothBands[i] = lerpAR(smoothBands[i], targetBands[i])
      }

      const bassJump = sBass - prevBass
      if ((bassJump > 0.065 && sBass > 0.32) || kickBoostRef.current > 0.75) {
        if (ripples.length < 4) {
          const minDim = Math.min(width, height)
          ripples.push({
            r: minDim * 0.21,
            alpha: 0.42,
            speed: minDim * 0.38,
          })
        }
      }
      prevBass = sBass

      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].r += ripples[i].speed * dt
        ripples[i].alpha -= dt * 0.62
        if (ripples[i].alpha <= 0.01) ripples.splice(i, 1)
      }

      drawScene(phase, dt)

      // Smoothly settle into the calm visible idle frame when paused, then sleep at 0% CPU
      const settledIdle =
        !playing &&
        activity < 0.004 &&
        sEnergy < 0.004 &&
        sBass < 0.004 &&
        ripples.length === 0 &&
        kickBoostRef.current < 0.01
      if (settledIdle) {
        activity = 0
        sBass = 0
        sMid = 0
        sTreble = 0
        sEnergy = 0
        smoothBands.fill(0)
        drawScene(phase)
        return
      }

      rafId = requestAnimationFrame(renderFrame)
    }

    const scheduleWake = () => {
      if (disposed) return
      lastTs = performance.now()
      if (isPlayingRef.current) startPollingIfNeeded()
      if (!rafId) {
        rafId = requestAnimationFrame(renderFrame)
      }
    }
    wakeRef.current = scheduleWake

    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    scheduleWake()

    const onVis = () => {
      if (!document.hidden) {
        drawScene(phase)
        if (isPlayingRef.current) scheduleWake()
      }
    }
    document.addEventListener('visibilitychange', onVis)

    const mo = new MutationObserver(() => {
      palette = readPalette(colorMode, mode)
      drawScene(phase)
    })
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    return () => {
      disposed = true
      wakeRef.current = null
      if (rafId) cancelAnimationFrame(rafId)
      stopPolling()
      ro?.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [styleVariant, colorMode, intensity, mode, audioEl, demo])

  if (styleVariant === 'none') return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('pointer-events-none block select-none border-0 bg-transparent', className)}
    />
  )
}
