export type Rgb = [number, number, number]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Parse `#RGB`, `#RRGGBB`, `RGB`, or `RRGGBB` into an `[r, g, b]` tuple (0..255). */
export function parseHexToRgb(input: string): Rgb | null {
  const clean = input.trim().replace(/^#/, '')
  let hex = clean
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  if (hex.length !== 6) return null
  for (let i = 0; i < 6; i++) {
    const c = hex.charCodeAt(i)
    const isHex =
      (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)
    if (!isHex) return null
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

let probeCtx: CanvasRenderingContext2D | null | undefined

/**
 * Parse ANY valid CSS color (`#rgb`, `#rrggbb`, `rgb(r, g, b)`, CSS Color 4 `rgb(r g b / a)`,
 * `hsl(...)`, `oklch(...)`, named colors) into `[r, g, b]` without fragile regexes or falsy-zero bugs.
 */
export function parseCssColorToRgb(raw: string, fallback: Rgb): Rgb {
  const trimmed = raw.trim()
  if (!trimmed) return fallback

  if (trimmed.startsWith('#')) {
    return parseHexToRgb(trimmed) ?? fallback
  }

  if (typeof document !== 'undefined') {
    if (probeCtx === undefined) {
      const c = document.createElement('canvas')
      c.width = 1
      c.height = 1
      probeCtx = c.getContext('2d', { willReadFrequently: true })
    }
    if (probeCtx) {
      probeCtx.clearRect(0, 0, 1, 1)
      probeCtx.fillStyle = 'rgba(0,0,0,0)'
      probeCtx.fillStyle = trimmed
      if (probeCtx.fillStyle !== 'rgba(0, 0, 0, 0)') {
        probeCtx.fillRect(0, 0, 1, 1)
        const data = probeCtx.getImageData(0, 0, 1, 1).data
        if (data[3] > 0) {
          return [data[0], data[1], data[2]]
        }
      }
    }
  }

  return fallback
}

/** WCAG 2.1 sRGB channel linearization (`0..255` -> linear `0..1`). */
function srgbChannelToLinear(channel255: number): number {
  const c = clamp(channel255 / 255, 0, 1)
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Exact WCAG 2.1 relative luminance (`0.0` pure black .. `1.0` pure white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  )
}

/** Exact WCAG 2.1 contrast ratio (`1.0` .. `21.0`). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

const DARK_INK: Rgb = [9, 9, 11] // #09090b
const LIGHT_INK: Rgb = [255, 255, 255] // #ffffff

/** Picks `#09090b` or `#ffffff` by highest WCAG 2.1 contrast ratio against any hex color. */
export function contrastForegroundForHex(hex: string): string {
  const rgb = parseHexToRgb(hex)
  if (!rgb) return '#ffffff'
  const darkContrast = contrastRatio(rgb, DARK_INK)
  const lightContrast = contrastRatio(rgb, LIGHT_INK)
  return darkContrast >= lightContrast ? '#09090b' : '#ffffff'
}
