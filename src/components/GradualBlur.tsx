import { memo, useMemo, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export type GradualBlurCurve = 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface GradualBlurProps {
  /** Edge position — Zuno applies this strictly to `'bottom'` behind the floating dock. */
  position?: 'bottom' | 'top' | 'left' | 'right'
  /** Total blur intensity multiplier in rem units (default `1.5`, ~24px peak blur). */
  strength?: number
  /** Height of the progressive blur band (default `'6.5rem'`). */
  height?: string
  /** Number of overlapping trapezoidal mask layers (default `5`). */
  divCount?: number
  /** Exponential progression gives a smooth optical ramp without a hard top crease. */
  exponential?: boolean
  /** Easing curve shaping the blur ramp across layers. */
  curve?: GradualBlurCurve
  /** Overall opacity of the progressive blur overlay (0..1). */
  opacity?: number
  /** Stacking layer — sits behind the floating dock (`z-20`) and over scrolling rows. */
  zIndex?: number
  className?: string
  style?: CSSProperties
}

const CURVE_FUNCTIONS: Record<GradualBlurCurve, (p: number) => number> = {
  linear: (p) => p,
  bezier: (p) => p * p * (3 - 2 * p),
  'ease-in': (p) => p * p,
  'ease-out': (p) => 1 - Math.pow(1 - p, 2),
  'ease-in-out': (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
}

const GRADIENT_DIR: Record<NonNullable<GradualBlurProps['position']>, string> = {
  bottom: 'to bottom',
  top: 'to top',
  left: 'to left',
  right: 'to right',
}

/**
 * Progressive multi-layer edge blur adapted from `@react-bits/GradualBlur-TS-TW`
 * (zero runtime dependencies — replaces `mathjs` with native `Math` and memoized layers).
 *
 * Stacks `divCount` overlapping 4-stop trapezoidal `mask-image` slices with exponentially
 * increasing `backdrop-filter: blur(...)` so scrolling tracks softly dissolve behind the
 * bottom floating dock without a hard seam or solid background bar.
 */
export const GradualBlur = memo(function GradualBlur({
  position = 'bottom',
  strength = 1.5,
  height = '6.5rem',
  divCount = 5,
  exponential = true,
  curve = 'bezier',
  opacity = 1,
  zIndex = 10,
  className,
  style,
}: GradualBlurProps) {
  const layers = useMemo(() => {
    const count = Math.max(2, Math.min(10, Math.round(divCount)))
    const increment = 100 / count
    const curveFn = CURVE_FUNCTIONS[curve] ?? CURVE_FUNCTIONS.bezier
    const direction = GRADIENT_DIR[position]

    return Array.from({ length: count }, (_, idx) => {
      const i = idx + 1
      const progress = curveFn(i / count)
      const blurRem = exponential
        ? Math.pow(2, progress * 4) * 0.0625 * strength
        : 0.0625 * (progress * count + 1) * strength

      const p1 = Math.round((increment * i - increment) * 10) / 10
      const p2 = Math.round(increment * i * 10) / 10
      const p3 = Math.round((increment * i + increment) * 10) / 10
      const p4 = Math.round((increment * i + increment * 2) * 10) / 10

      let stops = `transparent ${p1}%, black ${p2}%`
      if (p3 <= 100) stops += `, black ${p3}%`
      if (p4 <= 100) stops += `, transparent ${p4}%`

      const mask = `linear-gradient(${direction}, ${stops})`
      const blur = `blur(${blurRem.toFixed(3)}rem)`

      const layerStyle: CSSProperties = {
        position: 'absolute',
        inset: 0,
        maskImage: mask,
        WebkitMaskImage: mask,
        backdropFilter: blur,
        WebkitBackdropFilter: blur,
        opacity,
      }

      return { key: i, style: layerStyle }
    })
  }, [position, strength, divCount, exponential, curve, opacity])

  const isVertical = position === 'top' || position === 'bottom'

  const containerStyle: CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex,
    contain: 'strict',
    transform: 'translateZ(0)',
    ...(isVertical
      ? { left: 0, right: 0, [position]: 0, height }
      : { top: 0, bottom: 0, [position]: 0, width: height }),
    ...style,
  }

  return (
    <div
      aria-hidden="true"
      className={cn('zuno-gradual-blur select-none', className)}
      style={containerStyle}
    >
      <div className="relative h-full w-full">
        {layers.map((layer) => (
          <div key={layer.key} style={layer.style} />
        ))}
      </div>
    </div>
  )
})
