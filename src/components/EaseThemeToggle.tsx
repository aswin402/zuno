import { useId } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/utils'
import type { ThemeMode, ThemeTransitionId } from '@/lib/appearance'

interface EaseThemeToggleProps {
  mode: ThemeMode
  onToggle: () => void
  transition?: ThemeTransitionId
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

/**
 * Triggers a View Transitions API reveal (circle-blur, circle, rectangle, or blinds)
 * around any synchronous theme mutation callback, adapted from Zenko WebUI's BeUI ThemeToggle.
 */
export function runThemeViewTransition(
  apply: () => void,
  options?: {
    variant?: ThemeTransitionId
    origin?: { x: number; y: number }
  },
) {
  const variant = options?.variant ?? 'circle-blur'
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }

  if (reducedMotion || typeof document === 'undefined' || !doc.startViewTransition) {
    apply()
    return
  }

  const root = document.documentElement
  const originStr = options?.origin
    ? `${options.origin.x}px ${options.origin.y}px`
    : '50% 0%'

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
 * Smooth animated Sun <-> Moon theme toggle (@easeui/theme-toggle + Zenko 4-mode View Transitions).
 */
export function EaseThemeToggle({
  mode,
  onToggle,
  transition = 'circle-blur',
  size = 'sm',
  showLabel = false,
  className,
}: EaseThemeToggleProps) {
  const maskId = useId().replace(/:/g, '')
  const isDark = mode === 'dark'

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const origin = {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    }
    runThemeViewTransition(onToggle, { variant: transition, origin })
  }

  const iconCls = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'

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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          iconCls,
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

      {showLabel && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}
