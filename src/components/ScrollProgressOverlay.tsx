import { useEffect, useRef } from 'react'
import { ArrowUp } from 'lucide-react'
import { useScrollViewport } from '@/components/CompactScrollArea'
import { cn } from '@/lib/utils'
import type { ScrollProgressStyleId } from '@/lib/appearance'

interface ScrollProgressOverlayProps {
  styleVariant: ScrollProgressStyleId
  /** Optional static preview ratio (0..1) used inside Customize Studio cards. */
  previewRatio?: number
  className?: string
}

const CIRCLE_R = 13
const CIRCLE_CIRC = 2 * Math.PI * CIRCLE_R

/**
 * Zero-rerender scroll progress overlays inspired by:
 * - @skiper-ui/skiper89 (Draggable circular progress ring + live % counter)
 * - @skiper-ui/skiper94 (Vertical edge rail gauge + clipped percentage readout)
 * - @skiper-ui/skiper95 (Precision top hairline progress bar + floating tick scale)
 *
 * Updates strictly via direct DOM refs inside rAF (0 React re-renders during scroll).
 */
export function ScrollProgressOverlay({
  styleVariant,
  previewRatio,
  className,
}: ScrollProgressOverlayProps) {
  const viewportRef = useScrollViewport()
  const rootRef = useRef<HTMLDivElement>(null)
  const circleRef = useRef<SVGCircleElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const vFillRef = useRef<HTMLDivElement>(null)
  const vBadgeRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const idleTimerRef = useRef<number | undefined>(undefined)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startScrollTop: number
    maxScroll: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    if (styleVariant === 'none' || previewRatio !== undefined) return
    const vp = viewportRef?.current
    if (!vp) return

    let rafId = 0
    const apply = () => {
      rafId = 0
      const maxScroll = Math.max(0, vp.scrollHeight - vp.clientHeight)
      const root = rootRef.current
      if (!root) return

      if (maxScroll <= 24) {
        root.style.opacity = '0'
        root.style.pointerEvents = 'none'
        return
      }

      const ratio = Math.max(0, Math.min(1, vp.scrollTop / maxScroll))
      const pct = Math.round(ratio * 100)

      root.style.opacity = '1'
      root.style.pointerEvents = styleVariant === 'skiper89' ? 'auto' : 'none'

      if (circleRef.current) {
        circleRef.current.style.strokeDashoffset = String(CIRCLE_CIRC * (1 - ratio))
      }
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${ratio})`
      }
      if (vFillRef.current) {
        vFillRef.current.style.transform = `scaleY(${ratio})`
      }
      if (vBadgeRef.current) {
        vBadgeRef.current.style.transform = `translate3d(0, ${Math.round(ratio * 108)}px, 0)`
      }
      if (pctRef.current) {
        pctRef.current.textContent = `${pct}%`
      }
    }

    const schedule = () => {
      if (rootRef.current) rootRef.current.dataset.active = 'true'
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = window.setTimeout(() => {
        if (rootRef.current) rootRef.current.dataset.active = 'false'
      }, 1100)
      if (!rafId) rafId = requestAnimationFrame(apply)
    }

    apply()
    vp.addEventListener('scroll', schedule, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    ro?.observe(vp)
    if (vp.firstElementChild) ro?.observe(vp.firstElementChild)

    return () => {
      vp.removeEventListener('scroll', schedule)
      ro?.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
  }, [styleVariant, previewRatio, viewportRef])

  if (styleVariant === 'none') return null

  const p = previewRatio ?? 0
  const pctInit = `${Math.round(p * 100)}%`
  const isPreview = previewRatio !== undefined

  // ── 1. Skiper 89: Draggable Circular Scroll Ring + Live Counter ──
  if (styleVariant === 'skiper89') {
    return (
      <div
        ref={rootRef}
        data-active="false"
        style={!isPreview ? { opacity: 0, pointerEvents: 'none' } : undefined}
        onPointerDown={(e) => {
          if (isPreview) return
          const vp = viewportRef?.current
          if (!vp) return
          const maxScroll = Math.max(1, vp.scrollHeight - vp.clientHeight)
          dragRef.current = {
            pointerId: e.pointerId,
            startY: e.clientY,
            startScrollTop: vp.scrollTop,
            maxScroll,
            moved: false,
          }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d || d.pointerId !== e.pointerId) return
          const vp = viewportRef?.current
          if (!vp) return
          const dy = e.clientY - d.startY
          if (Math.abs(dy) > 4) d.moved = true
          if (d.moved) {
            const sensitivity = d.maxScroll / Math.max(180, vp.clientHeight * 0.55)
            vp.scrollTop = Math.max(0, Math.min(d.maxScroll, d.startScrollTop + dy * sensitivity))
          }
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          if (!d || d.pointerId !== e.pointerId) return
          dragRef.current = null
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
          if (!d.moved) {
            viewportRef?.current?.scrollTo({ top: 0, behavior: 'smooth' })
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        className={cn(
          isPreview
            ? 'inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 shadow-sm'
            : 'group/s89 absolute top-3.5 right-4 z-20 inline-flex select-none items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 shadow-lg transition-opacity duration-200 cursor-grab active:cursor-grabbing',
          className,
        )}
      >
        <div className="relative flex h-7 w-7 items-center justify-center">
          <svg viewBox="0 0 32 32" className="h-7 w-7 -rotate-90" aria-hidden="true">
            <circle
              cx="16"
              cy="16"
              r={CIRCLE_R}
              fill="none"
              stroke="var(--border)"
              strokeWidth="2.4"
            />
            <circle
              ref={circleRef}
              cx="16"
              cy="16"
              r={CIRCLE_R}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray={CIRCLE_CIRC}
              strokeDashoffset={CIRCLE_CIRC * (1 - p)}
            />
          </svg>
          <ArrowUp className="pointer-events-none absolute h-3 w-3 text-foreground/80 transition-transform group-hover/s89:-translate-y-0.5" />
        </div>
        <span
          ref={pctRef}
          className="min-w-[2.2rem] text-right font-mono text-[11px] font-semibold tabular-nums text-foreground"
        >
          {pctInit}
        </span>
      </div>
    )
  }

  // ── 2. Skiper 94: Vertical Edge Rail Gauge + Clipped % Indicator ──
  if (styleVariant === 'skiper94') {
    return (
      <div
        ref={rootRef}
        data-active="false"
        style={!isPreview ? { opacity: 0, pointerEvents: 'none' } : undefined}
        className={cn(
          isPreview
            ? 'relative flex h-24 items-center gap-2'
            : 'pointer-events-none absolute right-3.5 top-1/2 z-20 -translate-y-1/2 flex items-center gap-2 transition-opacity duration-200',
          className,
        )}
      >
        <div
          ref={vBadgeRef}
          style={{ transform: `translate3d(0, ${Math.round(p * (isPreview ? 52 : 108))}px, 0)` }}
          className="self-start rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-foreground shadow-sm"
        >
          <span ref={pctRef}>{pctInit}</span>
        </div>

        <div
          className={cn(
            'relative w-[3px] overflow-hidden rounded-full bg-border/80',
            isPreview ? 'h-20' : 'h-32',
          )}
        >
          <div
            ref={vFillRef}
            style={{ transform: `scaleY(${p})` }}
            className="h-full w-full origin-top rounded-full bg-primary will-change-transform"
          />
        </div>
      </div>
    )
  }

  // ── 3. Skiper 95: Top Precision Hairline + Tick Scale Counter ──
  return (
    <div
      ref={rootRef}
      data-active="false"
      style={!isPreview ? { opacity: 0, pointerEvents: 'none' } : undefined}
      className={cn(
        isPreview
          ? 'relative w-full space-y-2'
          : 'pointer-events-none absolute inset-x-0 top-0 z-20 transition-opacity duration-200',
        className,
      )}
    >
      <div className="h-[2px] w-full overflow-hidden bg-border/40">
        <div
          ref={barRef}
          style={{ transform: `scaleX(${p})` }}
          className="h-full w-full origin-left bg-primary will-change-transform"
        />
      </div>

      <div
        className={cn(
          'flex items-center justify-end px-4 pt-1.5 transition-opacity duration-300',
          !isPreview && 'opacity-0 [[data-active="true"]_&]:opacity-100',
        )}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-0.5 shadow-sm">
          <span className="flex items-end gap-[2px]" aria-hidden="true">
            <span className="h-1.5 w-[1.5px] rounded-full bg-muted-foreground/50" />
            <span className="h-2.5 w-[1.5px] rounded-full bg-primary" />
            <span className="h-1.5 w-[1.5px] rounded-full bg-muted-foreground/50" />
          </span>
          <span
            ref={pctRef}
            className="font-mono text-[10px] font-medium tabular-nums text-foreground"
          >
            {pctInit}
          </span>
        </div>
      </div>
    </div>
  )
}
