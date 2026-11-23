import { useEffect, useRef, useState } from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Hsv {
  h: number
  s: number
  v: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function parseHex(input: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!m) return null
  let hex = m[1]
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const p = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`
}

function hsvToRgb({ h, s, v }: Hsv): { r: number; g: number; b: number } {
  const sat = s / 100
  const val = v / 100
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return {
    r: Math.round(f(5) * 255),
    g: Math.round(f(3) * 255),
    b: Math.round(f(1) * 255),
  }
}

function rgbToHsv(r: number, g: number, b: number, prev?: Hsv): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const d = max - Math.min(rn, gn, bn)
  let h = prev?.h ?? 0
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max ? (d / max) * 100 : (prev?.s ?? 0), v: max * 100 }
}

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  presets?: string[]
  label?: string
  className?: string
}

/**
 * Interactive HSV Color Picker inspired by Zenko WebUI's BeUI ColorPicker:
 * 2D Saturation/Brightness drag surface with floating color loupe, rainbow Hue bar,
 * Hex input, EyeDropper support, and quick preset swatches.
 */
export function ColorPicker({
  value,
  onChange,
  presets = [],
  label = 'Color picker',
  className,
}: ColorPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [draggingArea, setDraggingArea] = useState(false)
  const [draggingHue, setDraggingHue] = useState(false)
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const [hsv, setHsv] = useState<Hsv>(() => {
    const rgb = parseHex(value) ?? { r: 250, g: 250, b: 250 }
    return rgbToHsv(rgb.r, rgb.g, rgb.b)
  })

  // Keep HSV synced when external value changes (e.g. preset switch)
  useEffect(() => {
    const rgb = parseHex(value)
    if (!rgb) return
    const curRgb = hsvToRgb(hsv)
    if (rgbToHex(curRgb.r, curRgb.g, curRgb.b) !== rgbToHex(rgb.r, rgb.g, rgb.b)) {
      setHsv((prev) => rgbToHsv(rgb.r, rgb.g, rgb.b, prev))
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const rgb = hsvToRgb(hsv)
  const currentHex = rgbToHex(rgb.r, rgb.g, rgb.b)

  const commitHsv = (next: Hsv) => {
    const clean: Hsv = {
      h: clamp(next.h, 0, 360),
      s: clamp(next.s, 0, 100),
      v: clamp(next.v, 0, 100),
    }
    setHsv(clean)
    const c = hsvToRgb(clean)
    onChange(rgbToHex(c.r, c.g, c.b))
  }

  const updateAreaFromPointer = (clientX: number, clientY: number) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    const x = clamp((clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((clientY - rect.top) / rect.height, 0, 1)
    commitHsv({ ...hsv, s: x * 100, v: (1 - y) * 100 })
  }

  const updateHueFromPointer = (clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect()
    if (!rect || !rect.width) return
    const x = clamp((clientX - rect.left) / rect.width, 0, 1)
    commitHsv({ ...hsv, h: x * 360 })
  }

  const hasEyeDropper =
    typeof window !== 'undefined' &&
    'EyeDropper' in window

  const openEyeDropper = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } })
        .EyeDropper
      const res = await new Ctor().open()
      const parsed = parseHex(res.sRGBHex)
      if (parsed) {
        setHsv((prev) => rgbToHsv(parsed.r, parsed.g, parsed.b, prev))
        onChange(rgbToHex(parsed.r, parsed.g, parsed.b))
      }
    } catch {
      /* user canceled eyedropper */
    }
  }

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center gap-2.5 rounded-xl border bg-background px-2.5 text-left transition-colors cursor-pointer',
          open ? 'border-primary' : 'border-border hover:border-muted-foreground/50',
        )}
      >
        <span
          className="h-5 w-5 shrink-0 rounded-md border border-black/15 shadow-inner"
          style={{ backgroundColor: currentHex }}
        />
        <span className="font-mono text-[11.5px] font-medium uppercase tracking-tight text-foreground">
          {currentHex}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 bottom-11 z-50 w-64 space-y-3 rounded-2xl border border-border bg-popover p-3 shadow-2xl animate-dock-pop">
          {/* 2D Saturation / Brightness Surface */}
          <div
            ref={areaRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDraggingArea(true)
              updateAreaFromPointer(e.clientX, e.clientY)
            }}
            onPointerMove={(e) => {
              if (draggingArea) updateAreaFromPointer(e.clientX, e.clientY)
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId)
              }
              setDraggingArea(false)
            }}
            onPointerCancel={() => setDraggingArea(false)}
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
            }}
            className="relative h-36 w-full touch-none rounded-xl ring-1 ring-black/10 ring-inset cursor-crosshair"
          >
            <div
              style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            >
              {/* Floating color loupe when dragging */}
              {draggingArea && (
                <span
                  style={{ backgroundColor: currentHex }}
                  className="absolute bottom-5 left-1/2 h-7 w-7 -translate-x-1/2 rounded-full border-2 border-white shadow-lg"
                />
              )}
              <span
                style={{ backgroundColor: currentHex }}
                className="block h-4 w-4 rounded-full border-2 border-white shadow-md"
              />
            </div>
          </div>

          {/* Rainbow Hue Slider */}
          <div
            ref={hueRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDraggingHue(true)
              updateHueFromPointer(e.clientX)
            }}
            onPointerMove={(e) => {
              if (draggingHue) updateHueFromPointer(e.clientX)
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId)
              }
              setDraggingHue(false)
            }}
            onPointerCancel={() => setDraggingHue(false)}
            style={{
              background:
                'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
            }}
            className="relative h-3 w-full touch-none rounded-full ring-1 ring-black/10 ring-inset cursor-pointer"
          >
            <span
              style={{
                left: `${(hsv.h / 360) * 100}%`,
                backgroundColor: `hsl(${hsv.h} 100% 50%)`,
              }}
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
            />
          </div>

          {/* Hex Input + EyeDropper */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                #
              </span>
              <input
                type="text"
                maxLength={6}
                spellCheck={false}
                value={hexDraft ?? currentHex.slice(1).toUpperCase()}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                  setHexDraft(raw)
                  if (raw.length === 6) {
                    const parsed = parseHex(raw)
                    if (parsed) {
                      setHsv((prev) => rgbToHsv(parsed.r, parsed.g, parsed.b, prev))
                      onChange(rgbToHex(parsed.r, parsed.g, parsed.b))
                    }
                  }
                }}
                onBlur={() => setHexDraft(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setHexDraft(null)
                }}
                aria-label="Hex color"
                className="h-8 w-full rounded-lg border border-border bg-background pl-6 pr-2 font-mono text-xs uppercase text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {hasEyeDropper && (
              <button
                type="button"
                onClick={openEyeDropper}
                aria-label="Pick color from screen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <Pipette className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* RGB Readout */}
          <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10.5px] text-muted-foreground">
            <div className="rounded-md border border-border/70 bg-background py-1">
              R <span className="text-foreground">{rgb.r}</span>
            </div>
            <div className="rounded-md border border-border/70 bg-background py-1">
              G <span className="text-foreground">{rgb.g}</span>
            </div>
            <div className="rounded-md border border-border/70 bg-background py-1">
              B <span className="text-foreground">{rgb.b}</span>
            </div>
          </div>

          {/* Preset Swatches */}
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {presets.map((p) => {
                const active = p.toLowerCase() === currentHex.toLowerCase()
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      const parsed = parseHex(p)
                      if (parsed) {
                        setHsv((prev) => rgbToHsv(parsed.r, parsed.g, parsed.b, prev))
                        onChange(rgbToHex(parsed.r, parsed.g, parsed.b))
                      }
                    }}
                    aria-label={`Set color ${p}`}
                    style={{ backgroundColor: p }}
                    className={cn(
                      'h-5 w-5 rounded-full border transition-transform hover:scale-110 cursor-pointer',
                      active
                        ? 'scale-110 border-foreground ring-2 ring-primary/40'
                        : 'border-black/20',
                    )}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
