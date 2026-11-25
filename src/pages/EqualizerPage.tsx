import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Plus, RotateCcw, Shield, Trash2 } from 'lucide-react'
import {
  AccordionPanel,
  MotionSwitch,
  SlidingTabs,
} from '@/components/ui/motion'
import { Tooltip } from '@/components/ui/tooltip'
import { ZunoIcon } from '@/components/ZunoIcon'
import { cn } from '@/lib/utils'
import { isTauriRuntime, zunoApi } from '@/lib/zunoApi'
import {
  BUILTIN_EQ_PRESETS,
  buildEqSplinePath,
  clampDb,
  EQ_BANDS,
  EQ_CATEGORIES,
  EQ_MAX_DB,
  EQ_MIN_DB,
  findActivePreset,
  formatDb,
  readSpectrumData,
  type EqCategory,
  type EqPreset,
  type EqSettings,
} from '@/lib/equalizer'
import type { IconPackId } from '@/lib/appearance'

interface EqualizerPageProps {
  settings: EqSettings
  isPlaying: boolean
  iconPack: IconPackId
  audioEl: HTMLAudioElement | null
  onChange: (patch: Partial<EqSettings>) => void
  onSelectPreset: (preset: EqPreset) => void
  onSaveCustomPreset: (name: string) => void
  onDeleteCustomPreset: (id: string) => void
  onResetFlat: () => void
  onEnsureAudioAttached: () => void
}

const CURVE_W = 800
const CURVE_H = 176
const PAD_X = 36
const PAD_Y = 20

export function EqualizerPage({
  settings,
  isPlaying,
  iconPack,
  audioEl,
  onChange,
  onSelectPreset,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onResetFlat,
  onEnsureAudioAttached,
}: EqualizerPageProps) {
  const gradId = useId()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const spectrumPathRef = useRef<SVGPathElement | null>(null)
  const [category, setCategory] = useState<EqCategory>('all')
  const [dragBand, setDragBand] = useState<number | null>(null)
  const [savingOpen, setSavingOpen] = useState(false)
  const [presetName, setPresetName] = useState('')

  const activePreset = useMemo(() => findActivePreset(settings), [settings])
  const effectiveBands = useMemo(
    () => (settings.enabled ? settings.bands : EQ_BANDS.map(() => 0)),
    [settings.enabled, settings.bands],
  )

  const spline = useMemo(
    () => buildEqSplinePath(effectiveBands, CURVE_W, CURVE_H, PAD_X, PAD_Y),
    [effectiveBands],
  )

  // Attach Web Audio graph when visiting EQ while playing so live spectrum stays responsive
  useEffect(() => {
    if (isPlaying) onEnsureAudioAttached()
  }, [isPlaying, onEnsureAudioAttached])

  // Zero-rerender live monochrome spectrum ribbon (works in BOTH native Tauri FFT & Web Audio,
  // pauses automatically when tab is hidden to save CPU)
  useEffect(() => {
    const pathEl = spectrumPathRef.current
    const native = isTauriRuntime()
    if (!isPlaying || (!native && !audioEl)) {
      if (pathEl) pathEl.setAttribute('d', '')
      return
    }
    let disposed = false
    let raf = 0
    let lastDraw = 0
    let pollTimer: number | undefined
    let pollInFlight = false
    const bins = new Uint8Array(new ArrayBuffer(64))
    const nativeBands = new Float32Array(24)

    const drawRibbon = (values: ArrayLike<number>, count: number, maxVal: number) => {
      const el = spectrumPathRef.current
      if (!el || count < 2) return
      const usableW = CURVE_W - PAD_X * 2
      const baseY = CURVE_H - PAD_Y
      const maxH = (CURVE_H - PAD_Y * 2) * 0.62
      const pts: string[] = [`M ${PAD_X} ${baseY}`]
      for (let i = 0; i < count; i++) {
        const x = PAD_X + (i / (count - 1)) * usableW
        const norm = Math.max(0, Math.min(1, (values[i] ?? 0) / maxVal))
        const y = baseY - norm * maxH
        pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`)
      }
      pts.push(`L ${CURVE_W - PAD_X} ${baseY} Z`)
      el.setAttribute('d', pts.join(' '))
    }

    if (native) {
      const pollNative = () => {
        if (disposed || document.hidden || pollInFlight) return
        pollInFlight = true
        zunoApi
          .audioLevels()
          .then((lvl) => {
            if (disposed || !lvl) return
            const len = Math.min(nativeBands.length, lvl.bands.length)
            for (let i = 0; i < len; i++) {
              nativeBands[i] = lvl.bands[i] ?? 0
            }
            drawRibbon(nativeBands, len, 1)
          })
          .finally(() => {
            pollInFlight = false
          })
      }
      pollNative()
      pollTimer = window.setInterval(pollNative, 33)
      return () => {
        disposed = true
        if (pollTimer !== undefined) window.clearInterval(pollTimer)
        if (spectrumPathRef.current) spectrumPathRef.current.setAttribute('d', '')
      }
    }

    const tick = (now: number) => {
      if (!document.hidden && now - lastDraw >= 32) {
        lastDraw = now
        if (readSpectrumData(audioEl, bins)) {
          drawRibbon(bins, 32, 255)
        }
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      if (spectrumPathRef.current) spectrumPathRef.current.setAttribute('d', '')
    }
  }, [isPlaying, audioEl])

  const allPresets = useMemo(
    () => [...BUILTIN_EQ_PRESETS, ...settings.customPresets],
    [settings.customPresets],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<EqCategory, number> = {
      all: allPresets.length,
      reference: 0,
      bass: 0,
      vocals: 0,
      genres: 0,
      custom: 0,
    }
    for (const p of allPresets) {
      counts[p.category] = (counts[p.category] ?? 0) + 1
    }
    return counts
  }, [allPresets])

  const filteredPresets = useMemo(() => {
    if (category === 'all') return allPresets
    return allPresets.filter((p) => p.category === category)
  }, [allPresets, category])

  function updateBand(index: number, db: number) {
    const next = [...settings.bands]
    next[index] = clampDb(db)
    onChange({
      enabled: true,
      bands: next,
      presetId: null,
    })
  }

  function nudgeRegion(region: 'bass' | 'mid' | 'treble', delta: number) {
    const next = settings.bands.map((db, idx) =>
      EQ_BANDS[idx].region === region ? clampDb(db + delta) : db,
    )
    onChange({
      enabled: true,
      bands: next,
      presetId: null,
    })
  }

  function clientYToDb(clientY: number, rect: DOMRect): number {
    const relY = ((clientY - rect.top) / rect.height) * CURVE_H
    const norm = (relY - PAD_Y) / (CURVE_H - PAD_Y * 2)
    return clampDb(EQ_MAX_DB - norm * (EQ_MAX_DB - EQ_MIN_DB))
  }

  function nearestBandIndex(clientX: number, rect: DOMRect): number {
    const relX = ((clientX - rect.left) / rect.width) * CURVE_W
    const norm = (relX - PAD_X) / (CURVE_W - PAD_X * 2)
    const idx = Math.round(norm * (EQ_BANDS.length - 1))
    return Math.max(0, Math.min(EQ_BANDS.length - 1, idx))
  }

  function handleCurvePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const idx = nearestBandIndex(e.clientX, rect)
    svg.setPointerCapture(e.pointerId)
    setDragBand(idx)
    updateBand(idx, clientYToDb(e.clientY, rect))
  }

  function handleCurvePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragBand === null) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    updateBand(dragBand, clientYToDb(e.clientY, rect))
  }

  function handleCurvePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (dragBand === null) return
    const svg = svgRef.current
    if (svg?.hasPointerCapture(e.pointerId)) {
      svg.releasePointerCapture(e.pointerId)
    }
    setDragBand(null)
  }

  function handleSaveSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = presetName.trim()
    if (!clean) return
    onSaveCustomPreset(clean)
    setPresetName('')
    setSavingOpen(false)
    setCategory('custom')
  }

  const isFlat =
    settings.preamp === 0 && settings.bands.every((b) => Math.abs(b) < 0.05)

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-6 sm:px-8 sm:pt-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Sound Engine
          </p>
          <div className="mt-0.5 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Equalizer
            </h1>
            <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {settings.enabled
                ? activePreset
                  ? activePreset.name
                  : 'Custom'
                : 'Bypassed'}
            </span>
          </div>
        </div>

        {/* Top controls: Reset, Save Custom, Master Power Toggle */}
        <div className="flex items-center gap-2">
          <Tooltip label="Reset all bands to 0 dB" side="bottom">
            <button
              type="button"
              onClick={onResetFlat}
              disabled={isFlat && settings.presetId === 'flat'}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Flat</span>
            </button>
          </Tooltip>

          <Tooltip label="Save current curve as preset" side="bottom">
            <button
              type="button"
              onClick={() => setSavingOpen((v) => !v)}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors cursor-pointer',
                savingOpen
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Save</span>
            </button>
          </Tooltip>

          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => onChange({ enabled: !settings.enabled })}
            className="t-press inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-2.5 pr-3 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer"
          >
            <MotionSwitch checked={settings.enabled} interactive={false} size="sm" />
            <span className="min-w-[20px] text-left">
              {settings.enabled ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </header>

      {/* Inline Save Custom Preset Drawer (transitions.dev 21 · Accordion expand) */}
      <AccordionPanel open={savingOpen}>
        <div className="pt-4">
          <form
            onSubmit={handleSaveSubmit}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3"
          >
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Name your custom preset (e.g. Night Desk, IEM Warm)..."
              maxLength={32}
              className="h-9 min-w-[200px] flex-1 rounded-full border border-border bg-background px-4 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!presetName.trim()}
              className="t-press inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              Save preset
            </button>
            <button
              type="button"
              onClick={() => {
                setSavingOpen(false)
                setPresetName('')
              }}
              className="t-press h-9 rounded-full px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
          </form>
        </div>
      </AccordionPanel>

      {/* Main Studio Console: Interactive Frequency Curve + 10 Precision Vertical Faders */}
      <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card">
        {/* Interactive Spline Curve Canvas */}
        <div className="relative border-b border-border/80 bg-background/40 px-2 pt-3 pb-1 select-none">
          <div className="flex items-center justify-between px-4 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            <span>Frequency Response · 10-Band ISO</span>
            <span className="tabular-nums">
              {dragBand !== null
                ? `${EQ_BANDS[dragBand].label} Hz · ${formatDb(settings.bands[dragBand])} dB`
                : 'Drag curve or double-click any band to reset'}
            </span>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
            onPointerDown={handleCurvePointerDown}
            onPointerMove={handleCurvePointerMove}
            onPointerUp={handleCurvePointerUp}
            onPointerCancel={handleCurvePointerUp}
            className="h-[156px] w-full touch-none cursor-crosshair sm:h-[176px]"
            aria-label="Interactive frequency response curve"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Horizontal dB grid hairlines (+12, +6, 0, -6, -12) */}
            {[-12, -6, 0, 6, 12].map((db) => {
              const norm = (EQ_MAX_DB - db) / (EQ_MAX_DB - EQ_MIN_DB)
              const y = PAD_Y + norm * (CURVE_H - PAD_Y * 2)
              const isZero = db === 0
              return (
                <g key={db}>
                  <line
                    x1={PAD_X}
                    x2={CURVE_W - PAD_X}
                    y1={y}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth={isZero ? 1.2 : 0.75}
                    strokeDasharray={isZero ? undefined : '3 5'}
                    opacity={isZero ? 0.95 : 0.55}
                  />
                  {(db === 12 || db === 0 || db === -12) && (
                    <text
                      x={10}
                      y={y + 3}
                      fill="var(--muted-foreground)"
                      fontSize="9"
                      opacity="0.65"
                      fontFamily="ui-monospace, monospace"
                    >
                      {db > 0 ? `+${db}` : db}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Subtle vertical guide lines for each band */}
            {spline.points.map((pt, i) => (
              <line
                key={EQ_BANDS[i].freq}
                x1={pt.x}
                x2={pt.x}
                y1={PAD_Y}
                y2={CURVE_H - PAD_Y}
                stroke="var(--border)"
                strokeWidth={dragBand === i ? 1.2 : 0.6}
                opacity={dragBand === i ? 0.9 : 0.35}
              />
            ))}

            {/* Ultra-subtle live monochrome spectrum ribbon when playing */}
            <path
              ref={spectrumPathRef}
              d=""
              fill="var(--foreground)"
              opacity="0.06"
            />

            {/* Area fill under the spline */}
            <path
              d={spline.area}
              fill={`url(#${gradId})`}
              opacity={settings.enabled ? 1 : 0.25}
              className="transition-opacity duration-200"
            />

            {/* Primary EQ curve */}
            <path
              d={spline.line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={settings.enabled ? 2.2 : 1.4}
              strokeLinecap="round"
              opacity={settings.enabled ? 1 : 0.35}
              className="transition-opacity duration-200"
            />

            {/* Draggable nodes on the curve */}
            {spline.points.map((pt, i) => {
              const activeNode = dragBand === i
              const boosted = Math.abs(effectiveBands[i]) > 0.05
              return (
                <g
                  key={EQ_BANDS[i].freq}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    updateBand(i, 0)
                  }}
                >
                  {activeNode && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={11}
                      fill="var(--primary)"
                      opacity={0.14}
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={activeNode ? 5.5 : boosted ? 4.2 : 3.2}
                    fill={settings.enabled ? 'var(--card)' : 'var(--muted)'}
                    stroke="var(--primary)"
                    strokeWidth={activeNode ? 2.4 : 1.8}
                    opacity={settings.enabled ? 1 : 0.45}
                  />
                </g>
              )
            })}
          </svg>
        </div>

        {/* 10 Precision Vertical Faders */}
        <div className="overflow-x-auto px-4 py-5 sm:px-6">
          <div className="grid min-w-[540px] grid-cols-10 gap-2">
            {EQ_BANDS.map((band, idx) => (
              <VerticalBandFader
                key={band.freq}
                label={band.label}
                value={settings.bands[idx] ?? 0}
                enabled={settings.enabled}
                highlighted={dragBand === idx}
                onChange={(db) => updateBand(idx, db)}
                onReset={() => updateBand(idx, 0)}
              />
            ))}
          </div>
        </div>

        {/* Bottom Studio Control Strip: Preamp + Quick Region Nudge + Limiter */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/80 bg-background/30 px-5 py-3.5 sm:px-6">
          {/* Preamp Slider */}
          <div className="flex min-w-[210px] flex-1 items-center gap-3 max-w-xs">
            <Tooltip label="Double-click to reset preamp to 0.0 dB" side="top">
              <button
                type="button"
                onDoubleClick={() => onChange({ preamp: 0 })}
                className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Preamp
              </button>
            </Tooltip>
            <div className="relative flex h-5 flex-1 items-center group">
              <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-accent">
                <div
                  className="absolute top-0 h-full rounded-full bg-primary transition-all duration-75"
                  style={centerBarHorizontalStyle(settings.preamp)}
                />
              </div>
              <div
                className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-sm transition-transform group-hover:scale-115"
                style={{
                  left: `${((settings.preamp - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) * 100}%`,
                }}
              />
              <input
                type="range"
                aria-label="Preamp gain"
                min={EQ_MIN_DB}
                max={EQ_MAX_DB}
                step={0.5}
                value={settings.preamp}
                onChange={(e) =>
                  onChange({ enabled: true, preamp: clampDb(Number(e.target.value)) })
                }
                onDoubleClick={() => onChange({ preamp: 0 })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="w-12 shrink-0 text-right tabular-nums text-xs text-foreground">
              {formatDb(settings.preamp)} dB
            </span>
          </div>

          {/* Quick Region Trim Controls (Bass / Mid / Treble ±1 dB) */}
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'bass', label: 'Bass' },
                { id: 'mid', label: 'Mid' },
                { id: 'treble', label: 'Treble' },
              ] as const
            ).map((reg) => (
              <div
                key={reg.id}
                className="inline-flex items-center rounded-full border border-border bg-card px-1 py-0.5 text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => nudgeRegion(reg.id, -1)}
                  aria-label={`Decrease ${reg.label}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  −
                </button>
                <span className="px-1.5 font-medium text-muted-foreground">
                  {reg.label}
                </span>
                <button
                  type="button"
                  onClick={() => nudgeRegion(reg.id, 1)}
                  aria-label={`Increase ${reg.label}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  +
                </button>
              </div>
            ))}
          </div>

          {/* Soft Limiter Toggle */}
          <Tooltip
            label="Prevents audio clipping when boosting bass or gain"
            side="top"
          >
            <button
              type="button"
              onClick={() => onChange({ limiter: !settings.limiter })}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors cursor-pointer',
                settings.limiter
                  ? 'border-border bg-secondary text-foreground'
                  : 'border-border/70 bg-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Limiter {settings.limiter ? 'On' : 'Off'}</span>
            </button>
          </Tooltip>
        </div>
      </section>

      {/* Preset Categories & Curated / Custom Preset Cards */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SlidingTabs<EqCategory>
            value={category}
            onChange={setCategory}
            variant="compact"
            wrap
            ariaLabel="Equalizer preset categories"
            options={EQ_CATEGORIES.map((cat) => ({
              value: cat.id,
              label: (
                <>
                  <span>{cat.label}</span>
                  <span className="tabular-nums text-[10px] opacity-65">
                    {categoryCounts[cat.id]}
                  </span>
                </>
              ),
            }))}
          />
        </div>

        {filteredPresets.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
            <ZunoIcon
              name="equalizer"
              pack={iconPack}
              className="h-6 w-6 text-muted-foreground/60"
            />
            <p className="mt-2.5 text-sm font-medium text-foreground">
              No custom presets yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Shape the curve above, then click Save to store your own sound profile.
            </p>
            <button
              type="button"
              onClick={() => setSavingOpen(true)}
              className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Save current curve
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPresets.map((preset) => {
              const selected =
                settings.enabled && settings.presetId === preset.id
              return (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  selected={selected}
                  onSelect={() => onSelectPreset(preset)}
                  onDelete={
                    preset.custom
                      ? () => onDeleteCustomPreset(preset.id)
                      : undefined
                  }
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function centerBarHorizontalStyle(db: number): React.CSSProperties {
  const half = 50
  const pct = (Math.abs(db) / EQ_MAX_DB) * half
  if (db >= 0) {
    return { left: '50%', width: `${pct}%` }
  }
  return { left: `${50 - pct}%`, width: `${pct}%` }
}

function VerticalBandFader({
  label,
  value,
  enabled,
  highlighted,
  onChange,
  onReset,
}: {
  label: string
  value: number
  enabled: boolean
  highlighted: boolean
  onChange: (db: number) => void
  onReset: () => void
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      onChangeRef.current(clampDb(valueRef.current + (e.deltaY < 0 ? 0.5 : -0.5)))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const displayDb = enabled ? value : 0
  const normPct = ((EQ_MAX_DB - displayDb) / (EQ_MAX_DB - EQ_MIN_DB)) * 100
  const isBoost = displayDb > 0.05
  const isCut = displayDb < -0.05
  const barPct = (Math.abs(displayDb) / EQ_MAX_DB) * 50

  function pointerToDb(clientY: number): number {
    const el = trackRef.current
    if (!el) return value
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return clampDb(EQ_MAX_DB - ratio * (EQ_MAX_DB - EQ_MIN_DB))
  }

  return (
    <div className="flex flex-col items-center gap-2.5 select-none">
      {/* Numeric dB readout */}
      <Tooltip label="Double-click to reset" side="top">
        <button
          type="button"
          onDoubleClick={onReset}
          className={cn(
            'tabular-nums text-[11px] font-medium transition-colors cursor-pointer',
            dragging || highlighted
              ? 'text-primary'
              : Math.abs(displayDb) > 0.05
                ? 'text-foreground'
                : 'text-muted-foreground/70',
          )}
        >
          {formatDb(displayDb)}
        </button>
      </Tooltip>

      {/* Precision vertical track with pointer capture */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label} Hz band`}
        aria-valuemin={EQ_MIN_DB}
        aria-valuemax={EQ_MAX_DB}
        aria-valuenow={value}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          onChange(pointerToDb(e.clientY))
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          onChange(pointerToDb(e.clientY))
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
          setDragging(false)
        }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={onReset}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(clampDb(value + 0.5))
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(clampDb(value - 0.5))
          } else if (e.key === 'Home' || e.key === '0') {
            e.preventDefault()
            onReset()
          }
        }}
        className="group relative flex h-36 w-9 touch-none items-center justify-center cursor-ns-resize focus:outline-none"
      >
        {/* Rail */}
        <div className="relative h-full w-[4px] overflow-hidden rounded-full bg-accent">
          {/* Center 0dB notch */}
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-muted-foreground/40" />

          {/* Bi-directional active fill from 0 dB center */}
          {(isBoost || isCut) && (
            <div
              className="absolute inset-x-0 rounded-full bg-primary transition-[height,top] duration-75"
              style={
                isBoost
                  ? { top: `${50 - barPct}%`, height: `${barPct}%` }
                  : { top: '50%', height: `${barPct}%` }
              }
            />
          )}
        </div>

        {/* Center horizontal tick marks */}
        <span className="pointer-events-none absolute top-1/2 left-1.5 h-[1px] w-1.5 bg-border" />
        <span className="pointer-events-none absolute top-1/2 right-1.5 h-[1px] w-1.5 bg-border" />

        {/* Hardware-inspired tactile thumb */}
        <div
          className={cn(
            'pointer-events-none absolute left-1/2 h-3.5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-transform',
            dragging || highlighted
              ? 'scale-110 border-primary bg-primary shadow-md'
              : enabled
                ? 'border-primary/80 bg-card shadow-sm group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-ring'
                : 'border-border bg-secondary opacity-60',
          )}
          style={{ top: `${normPct}%` }}
        >
          <span
            className={cn(
              'absolute inset-x-1.5 top-1/2 h-[1.5px] -translate-y-1/2 rounded-full',
              dragging || highlighted
                ? 'bg-primary-foreground'
                : 'bg-primary/70',
            )}
          />
        </div>
      </div>

      {/* Frequency label */}
      <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function PresetCard({
  preset,
  selected,
  onSelect,
  onDelete,
}: {
  preset: EqPreset
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
}) {
  const mini = useMemo(
    () => buildEqSplinePath(preset.bands, 76, 28, 4, 5),
    [preset.bands],
  )

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all cursor-pointer',
        selected
          ? 'border-primary bg-secondary shadow-sm'
          : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-secondary/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {preset.name}
          </p>
          {selected && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {preset.tagline}
        </p>
      </div>

      {/* Mini sparkline preview of preset curve */}
      <div className="flex shrink-0 items-center gap-1.5">
        <svg
          viewBox="0 0 76 28"
          className="h-7 w-[76px] shrink-0"
          aria-hidden="true"
        >
          <line
            x1="4"
            x2="72"
            y1="14"
            y2="14"
            stroke="var(--border)"
            strokeWidth="0.8"
          />
          <path
            d={mini.line}
            fill="none"
            stroke={selected ? 'var(--primary)' : 'var(--muted-foreground)'}
            strokeWidth={selected ? 1.8 : 1.3}
            strokeLinecap="round"
            opacity={selected ? 1 : 0.75}
          />
        </svg>

        {onDelete && (
          <Tooltip label="Delete preset" side="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              aria-label={`Delete ${preset.name}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
