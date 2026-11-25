import { useId } from 'react'
import { flushSync } from 'react-dom'
import { prefersReducedMotion } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  ThemeMode,
  ThemeToggleStyleId,
  ThemeTransitionId,
  ThemeTransitionStartId,
} from '@/lib/appearance'

interface EaseThemeToggleProps {
  mode: ThemeMode
  onToggle: () => void
  transition?: ThemeTransitionId
  transitionStart?: ThemeTransitionStartId
  toggleStyle?: ThemeToggleStyleId
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

const ORIGIN_BY_START: Record<Exclude<ThemeTransitionStartId, 'trigger'>, string> = {
  center: '50% 50%',
  'top-left': '0% 0%',
  'top-right': '100% 0%',
  'bottom-left': '0% 100%',
  'bottom-right': '100% 100%',
}

function resolveOriginCss(
  start: ThemeTransitionStartId | undefined,
  triggerOrigin?: { x: number; y: number },
): string {
  if (start && start !== 'trigger') {
    return ORIGIN_BY_START[start] ?? '50% 50%'
  }
  return triggerOrigin ? `${triggerOrigin.x}px ${triggerOrigin.y}px` : '50% 0%'
}

/**
 * Triggers a View Transitions API reveal inspired by @skiper-ui/skiper26
 * (circle-blur, circle, polygon, bottom-up, rectangle, or blinds) with configurable origin.
 */
export function runThemeViewTransition(
  apply: () => void,
  options?: {
    variant?: ThemeTransitionId
    start?: ThemeTransitionStartId
    origin?: { x: number; y: number }
  },
) {
  const variant = options?.variant ?? 'circle-blur'
  const reducedMotion = prefersReducedMotion()

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }

  if (reducedMotion || typeof document === 'undefined' || !doc.startViewTransition) {
    apply()
    return
  }

  const root = document.documentElement
  const originStr = resolveOriginCss(options?.start, options?.origin)

  root.style.setProperty('--zuno-vt-origin', originStr)
  root.dataset.zunoVt = variant

  const vt = doc.startViewTransition(() => {
    flushSync(() => {
      apply()
    })
  })

  vt.finished.finally(() => {
    delete root.dataset.zunoVt
  })
}

/**
 * Animated Sun <-> Moon theme toggle with 7 styles:
 * Eclipse Mask, SmoothUI Kinetic, + 5 variants inspired by @skiper-ui/skiper4,
 * paired with @skiper-ui/skiper26 View Transitions.
 */
export function EaseThemeToggle({
  mode,
  onToggle,
  transition = 'circle-blur',
  transitionStart = 'trigger',
  toggleStyle = 'eclipse',
  size = 'sm',
  showLabel = false,
  className,
}: EaseThemeToggleProps) {
  const maskId = useId().split(':').join('')
  const isDark = mode === 'dark'

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const origin = {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    }
    runThemeViewTransition(onToggle, {
      variant: transition,
      start: transitionStart,
      origin,
    })
  }

  const iconCls = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'

  // SmoothUI Kinetic Theme Toggle (@smoothui/theme-toggle): tactile dual-layer spring morph
  if (toggleStyle === 'smoothui' && !showLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-pressed={!isDark}
        className={cn(
          'group/smooth relative inline-flex items-center justify-center overflow-hidden rounded-full border border-border bg-card text-foreground shadow-xs transition-all duration-300 hover:border-primary/50 hover:bg-secondary active:scale-90 cursor-pointer',
          size === 'md' ? 'h-9 w-9' : 'h-7 w-7',
          className,
        )}
      >
        <span className="relative flex h-4 w-4 items-center justify-center">
          {/* Sun layer */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={cn(
              'absolute h-3.5 w-3.5 transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              isDark
                ? 'translate-y-4 rotate-90 scale-50 opacity-0'
                : 'translate-y-0 rotate-0 scale-100 opacity-100',
            )}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
            <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
          </svg>
          {/* Moon layer */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={cn(
              'absolute h-3.5 w-3.5 transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              isDark
                ? 'translate-y-0 rotate-0 scale-100 opacity-100'
                : '-translate-y-4 -rotate-90 scale-50 opacity-0',
            )}
            aria-hidden="true"
          >
            <path
              d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"
              fill="currentColor"
              fillOpacity="0.22"
            />
          </svg>
        </span>
      </button>
    )
  }

  // Variant 5 (@skiper-ui/skiper4 Switch Pill): sleek compact sliding capsule
  if (toggleStyle === 'skiper-5' && !showLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-pressed={!isDark}
        className={cn(
          'relative inline-flex items-center rounded-full border border-border bg-secondary/80 p-0.5 transition-colors hover:border-muted-foreground/50 cursor-pointer',
          size === 'md' ? 'h-8 w-14' : 'h-6 w-11',
          className,
        )}
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            size === 'md' ? 'h-6.5 w-6.5' : 'h-4.5 w-4.5',
            isDark
              ? 'translate-x-0'
              : size === 'md'
                ? 'translate-x-[22px]'
                : 'translate-x-[18px]',
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
            {isDark ? (
              <path
                d="M19.5 14.5A7.5 7.5 0 019.5 4.5a8 8 0 1010 10z"
                fill="currentColor"
              />
            ) : (
              <>
                <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="12" y1="2.5" x2="12" y2="4.5" />
                  <line x1="12" y1="19.5" x2="12" y2="21.5" />
                  <line x1="2.5" y1="12" x2="4.5" y2="12" />
                  <line x1="19.5" y1="12" x2="21.5" y2="12" />
                </g>
              </>
            )}
          </svg>
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={!isDark}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-colors cursor-pointer',
        showLabel
          ? 'h-9 gap-2 border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-secondary'
          : size === 'md'
            ? 'h-9 w-9 border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
            : 'h-7 w-7 text-muted-foreground hover:bg-secondary hover:text-foreground',
        className,
      )}
    >
      <ThemeToggleGlyph
        style={toggleStyle}
        isDark={isDark}
        maskId={maskId}
        className={iconCls}
      />

      {showLabel && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}

export function ThemeToggleGlyph({
  style,
  isDark,
  maskId,
  className,
}: {
  style: ThemeToggleStyleId
  isDark: boolean
  maskId: string
  className?: string
}) {
  // SmoothUI Kinetic Toggle glyph (for preview & labeled mode)
  if (style === 'smoothui') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        className={cn(
          className,
          'transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          isDark ? 'rotate-0' : 'rotate-90',
        )}
        aria-hidden="true"
      >
        {isDark ? (
          <path
            d="M20.2 14.5A8.2 8.2 0 0 1 9.5 3.8a8.2 8.2 0 1 0 10.7 10.7Z"
            fill="currentColor"
            fillOpacity="0.24"
          />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" fill="currentColor" fillOpacity="0.22" />
            <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2.5 12h2M19.5 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
          </>
        )}
      </svg>
    )
  }

  // Skiper 4 Variant 1: Split Half-Disc (Yin-Yang rotation)
  if (style === 'skiper-1') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          className,
          'transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          isDark ? 'rotate-0' : 'rotate-180',
        )}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor" />
      </svg>
    )
  }

  // Skiper 4 Variant 2: Horizon Sun / Crescent
  if (style === 'skiper-2') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <line
          x1="3"
          y1="17.5"
          x2="21"
          y2="17.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <g
          className={cn(
            'origin-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            isDark ? 'translate-y-1.5 opacity-85' : 'translate-y-0 opacity-100',
          )}
        >
          <path
            d="M7 15a5 5 0 0 1 10 0"
            fill={isDark ? 'none' : 'currentColor'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className={cn(
              'origin-center transition-all duration-300',
              isDark ? 'scale-0 opacity-0' : 'scale-100 opacity-100',
            )}
          >
            <line x1="12" y1="4.5" x2="12" y2="6.8" />
            <line x1="5.6" y1="7.8" x2="7.2" y2="9.4" />
            <line x1="18.4" y1="7.8" x2="16.8" y2="9.4" />
          </g>
        </g>
      </svg>
    )
  }

  // Skiper 4 Variant 3: Expand Dot Cutout
  if (style === 'skiper-3') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <mask id={`skiper3-${maskId}`}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle
            cx={isDark ? 16 : 25}
            cy={isDark ? 8 : 2}
            r={isDark ? 7 : 3}
            fill="black"
            className="transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </mask>
        <circle
          cx="12"
          cy="12"
          r={isDark ? 8.2 : 6.4}
          fill="currentColor"
          mask={`url(#skiper3-${maskId})`}
          className="transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        />
        <circle
          cx="12"
          cy="12"
          r="9.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="2 3.4"
          className={cn(
            'origin-center transition-all duration-500',
            isDark ? 'scale-75 opacity-0 rotate-45' : 'scale-100 opacity-90 rotate-0',
          )}
        />
      </svg>
    )
  }

  // Skiper 4 Variant 4: Orbital Ring Satellite
  if (style === 'skiper-4') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          className,
          'transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          isDark ? 'rotate-0' : 'rotate-180',
        )}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="7.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.45"
        />
        <circle
          cx="12"
          cy="12"
          r={isDark ? 3.2 : 4.2}
          fill="currentColor"
          className="transition-all duration-300"
        />
        <circle
          cx="12"
          cy="4.5"
          r="2.4"
          fill="currentColor"
          className="transition-all duration-300"
        />
      </svg>
    )
  }

  // Skiper 4 Variant 5 icon fallback (when showLabel=true)
  if (style === 'skiper-5') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect
          x="2.5"
          y="6.5"
          width="19"
          height="11"
          rx="5.5"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle
          cx={isDark ? 8.5 : 15.5}
          cy="12"
          r="3.2"
          fill="currentColor"
          className="transition-all duration-300"
        />
      </svg>
    )
  }

  // Default: Eclipse Mask Sun <-> Moon
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn(
        className,
        'overflow-visible transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        isDark ? 'rotate-40' : 'rotate-0',
      )}
      aria-hidden="true"
    >
      <mask id={`ease-moon-${maskId}`}>
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <circle
          cx={isDark ? 15.5 : 24}
          cy={isDark ? 8.5 : 4}
          r={isDark ? 6.2 : 5}
          fill="black"
          className="transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        />
      </mask>

      <circle
        cx="12"
        cy="12"
        r={isDark ? 7 : 5}
        fill="currentColor"
        mask={`url(#ease-moon-${maskId})`}
        className="transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      />

      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={cn(
          'origin-center transition-all duration-300 ease-out',
          isDark ? 'scale-0 opacity-0' : 'scale-100 opacity-100',
        )}
      >
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
        <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
      </g>
    </svg>
  )
}
