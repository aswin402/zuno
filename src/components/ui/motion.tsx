import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { prefersReducedMotion } from '@/lib/format'
import { cn } from '@/lib/utils'

/* ── 04 · TextSwap (3-phase blurred vertical text transition — transitions.dev + Music Player Likes) ── */

interface TextSwapProps {
  text: string
  as?: 'span' | 'p' | 'h1' | 'h2' | 'div'
  className?: string
}

export function TextSwap({ text, as = 'span', className }: TextSwapProps) {
  const [shown, setShown] = useState(text)
  const elRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef(text)
  const needsEnterRef = useRef(false)

  useEffect(() => {
    pendingRef.current = text
    if (text === shown) return

    if (prefersReducedMotion()) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setShown(text)
      return
    }

    const el = elRef.current
    if (!el) {
      setShown(text)
      return
    }

    el.classList.remove('is-enter-start')
    el.classList.add('is-exit')

    if (timerRef.current === null) {
      const dur =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--text-swap-dur'),
        ) || 150
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        needsEnterRef.current = true
        setShown(pendingRef.current)
      }, dur)
    }
  }, [text, shown])

  useLayoutEffect(() => {
    if (!needsEnterRef.current) return
    needsEnterRef.current = false
    const el = elRef.current
    if (!el) return
    el.classList.remove('is-exit')
    el.classList.add('is-enter-start')
    void el.offsetHeight // Force reflow so the new text transitions cleanly from below
    el.classList.remove('is-enter-start')
  }, [shown])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const Tag = as
  return (
    <Tag
      ref={elRef as never}
      className={cn('t-text-swap', as !== 'span' && 'block', className)}
    >
      {shown}
    </Tag>
  )
}

/* ── 09 · IconSwap (grid-stacked cross-blur + scale icon morph — transitions.dev) ── */

interface IconSwapProps {
  active: 'a' | 'b'
  iconA: ReactNode
  iconB: ReactNode
  className?: string
}

export function IconSwap({ active, iconA, iconB, className }: IconSwapProps) {
  return (
    <span className={cn('t-icon-swap', className)} data-state={active}>
      <span className="t-icon" data-icon="a" aria-hidden={active !== 'a'}>
        {iconA}
      </span>
      <span className="t-icon" data-icon="b" aria-hidden={active !== 'b'}>
        {iconB}
      </span>
    </span>
  )
}

/* ── 16 · SlidingTabs (measured sliding active pill — transitions.dev + Snapshot Toolbar) ── */

export interface SlidingTabOption<T extends string> {
  value: T
  label: ReactNode
  ariaLabel?: string
}

interface SlidingTabsProps<T extends string> {
  value: T
  options: SlidingTabOption<T>[]
  onChange: (value: T) => void
  variant?: 'pill' | 'card' | 'compact'
  wrap?: boolean
  stopPointerDown?: boolean
  ariaLabel?: string
  className?: string
  pillClassName?: string
  tabClassName?: string
}

export function SlidingTabs<T extends string>({
  value,
  options,
  onChange,
  variant = 'card',
  wrap = false,
  stopPointerDown = false,
  ariaLabel,
  className,
  pillClassName,
  tabClassName,
}: SlidingTabsProps<T>) {
  const barRef = useRef<HTMLDivElement | null>(null)
  const pillRef = useRef<HTMLSpanElement | null>(null)
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map())
  const hasPaintedRef = useRef(false)

  const syncPill = useCallback(
    (animate: boolean) => {
      const pill = pillRef.current
      const activeTab = tabRefs.current.get(value)
      if (!pill || !activeTab) return

      const x = activeTab.offsetLeft
      const y = activeTab.offsetTop
      const w = activeTab.offsetWidth
      const h = activeTab.offsetHeight
      if (w === 0 && h === 0) return

      if (!animate || prefersReducedMotion()) {
        const prev = pill.style.transition
        pill.style.transition = 'none'
        pill.style.transform = `translate3d(${x}px, ${y}px, 0)`
        pill.style.width = `${w}px`
        pill.style.height = `${h}px`
        pill.style.opacity = '1'
        void pill.offsetWidth
        pill.style.transition = prev
      } else {
        pill.style.transform = `translate3d(${x}px, ${y}px, 0)`
        pill.style.width = `${w}px`
        pill.style.height = `${h}px`
        pill.style.opacity = '1'
      }
    },
    [value],
  )

  useLayoutEffect(() => {
    syncPill(hasPaintedRef.current)
    hasPaintedRef.current = true
  }, [syncPill, options.length])

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = new ResizeObserver(() => syncPill(false))
    ro.observe(bar)
    // Snap once fonts finish loading in case tab widths changed subtly
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => syncPill(false)).catch(() => {})
    }
    return () => ro.disconnect()
  }, [syncPill])

  const containerVariant =
    variant === 'pill'
      ? 'gap-0.5 rounded-full border border-border bg-secondary/70 p-0.5'
      : variant === 'compact'
        ? 'gap-1 rounded-full border border-border bg-card p-1'
        : 'gap-1.5 rounded-2xl border border-border bg-card p-1.5'

  const pillVariant =
    variant === 'pill' || variant === 'compact'
      ? 'rounded-full bg-primary shadow-xs'
      : 'rounded-xl bg-primary shadow-xs'

  const tabVariant =
    variant === 'pill'
      ? 'rounded-full px-3.5 py-1.5 text-xs font-semibold'
      : variant === 'compact'
        ? 'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium'
        : 'rounded-xl px-3.5 py-2 text-xs font-medium'

  return (
    <div
      ref={barRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        't-tabs',
        wrap && 'flex-wrap',
        containerVariant,
        className,
      )}
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className={cn('t-tabs-pill', pillVariant, pillClassName)}
      />
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            ref={(node) => {
              if (node) tabRefs.current.set(opt.value, node)
              else tabRefs.current.delete(opt.value)
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={opt.ariaLabel}
            onPointerDown={stopPointerDown ? (e) => e.stopPropagation() : undefined}
            onClick={() => onChange(opt.value)}
            className={cn(
              't-tab cursor-pointer select-none',
              tabVariant,
              active
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
              tabClassName,
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── 27 · MotionSwitch (double-bounce overshoot thumb gated on user interaction — transitions.dev) ── */

interface MotionSwitchProps {
  checked: boolean
  onChange?: (next: boolean) => void
  size?: 'sm' | 'md'
  interactive?: boolean
  ariaLabel?: string
  className?: string
}

export function MotionSwitch({
  checked,
  onChange,
  size = 'sm',
  interactive = true,
  ariaLabel,
  className,
}: MotionSwitchProps) {
  const prevCheckedRef = useRef(checked)
  const hasInteractedRef = useRef(false)
  if (prevCheckedRef.current !== checked) {
    hasInteractedRef.current = true
    prevCheckedRef.current = checked
  }

  const dims =
    size === 'md'
      ? {
          track: 'h-[22px] w-[40px] p-[3px]',
          thumb: 'h-4 w-4',
          travel: '18px',
        }
      : {
          track: 'h-5 w-9 p-[3px]',
          thumb: 'h-3.5 w-3.5',
          travel: '16px',
        }

  const trackStyle = { '--toggle-travel': dims.travel } as CSSProperties

  const trackClasses = cn(
    't-toggle relative inline-flex shrink-0 items-center rounded-full',
    dims.track,
    hasInteractedRef.current && 'is-init',
    checked ? 'bg-primary' : 'bg-accent',
    interactive && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  )

  const thumb = (
    <span
      aria-hidden="true"
      className={cn(
        't-toggle-thumb inline-block rounded-full transition-colors duration-150',
        dims.thumb,
        checked ? 'bg-primary-foreground' : 'bg-muted-foreground',
      )}
    />
  )

  if (!interactive) {
    return (
      <span
        aria-hidden="true"
        data-on={checked ? 'true' : 'false'}
        style={trackStyle}
        className={trackClasses}
      >
        {thumb}
      </span>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-on={checked ? 'true' : 'false'}
      style={trackStyle}
      onClick={() => {
        hasInteractedRef.current = true
        onChange?.(!checked)
      }}
      className={trackClasses}
    >
      {thumb}
    </button>
  )
}

/* ── 21 · AccordionPanel & AccordionChevron (0fr <-> 1fr + scaleY flip — transitions.dev) ── */

interface AccordionPanelProps {
  open: boolean
  children: ReactNode
  className?: string
  innerClassName?: string
}

export function AccordionPanel({
  open,
  children,
  className,
  innerClassName,
}: AccordionPanelProps) {
  return (
    <div className={cn('t-acc', className)} data-open={open ? 'true' : 'false'}>
      <div className="t-acc-panel" aria-hidden={!open} inert={!open}>
        <div className={cn('t-acc-panel-inner', innerClassName)}>{children}</div>
      </div>
    </div>
  )
}

export function AccordionChevron({
  open,
  className,
}: {
  open: boolean
  className?: string
}) {
  return (
    <span
      className={cn('t-acc-chevron', className)}
      data-open={open ? 'true' : 'false'}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M4 6.5L8 10.5L12 6.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}

/* ── 22 · MotionToast (asymmetric 350ms open / 250ms close floating pill — transitions.dev) ── */

interface MotionToastProps {
  message: string | null
  edge?: 'top' | 'bottom'
  className?: string
}

export function MotionToast({
  message,
  edge = 'top',
  className,
}: MotionToastProps) {
  const [mounted, setMounted] = useState(Boolean(message))
  const [open, setOpen] = useState(false)
  const [displayMsg, setDisplayMsg] = useState(message ?? '')

  useEffect(() => {
    if (message) {
      setDisplayMsg(message)
      setMounted(true)
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setOpen(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    setOpen(false)
    if (!mounted) return
    const timer = window.setTimeout(
      () => setMounted(false),
      prefersReducedMotion() ? 0 : 270,
    )
    return () => window.clearTimeout(timer)
  }, [message, mounted])

  if (!mounted || !displayMsg) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2',
        edge === 'top' ? 'top-4' : 'bottom-4',
        className,
      )}
    >
      <div
        data-edge={edge}
        className={cn(
          't-toast rounded-full border border-border bg-popover/95 px-4 py-2 text-xs font-medium text-popover-foreground shadow-2xl whitespace-nowrap',
          open && 'is-open',
        )}
      >
        {displayMsg}
      </div>
    </div>
  )
}
