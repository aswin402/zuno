import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

const MIN_THUMB_PX = 28
const MAX_THUMB_PX = 44
const TRACK_INSET_PX = 10

/**
 * Compact overlay scroll container inspired by Zenko WebUI's CompactScrollArea.
 * Hides bulky native scrollbars and draws a short, rounded, theme-tinted pill thumb
 * with smooth pointer dragging and quiet fade-on-idle.
 */
export function CompactScrollArea({
  children,
  className,
  viewportClassName,
  autoHeight = false,
}: {
  children: ReactNode
  className?: string
  viewportClassName?: string
  autoHeight?: boolean
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState({
    overflow: false,
    thumbHeight: 34,
    thumbTop: TRACK_INSET_PX,
  })
  const [dragging, setDragging] = useState(false)
  const [scrolling, setScrolling] = useState(false)
  const hideTimerRef = useRef<number | undefined>(undefined)
  const dragStateRef = useRef<{
    pointerId: number
    startY: number
    startScrollTop: number
    maxScroll: number
    travel: number
  } | null>(null)

  const syncMetrics = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const maxScroll = Math.max(0, scrollHeight - clientHeight)
    if (maxScroll <= 1 || clientHeight <= TRACK_INSET_PX * 2) {
      setMetrics((prev) =>
        prev.overflow ? { overflow: false, thumbHeight: 34, thumbTop: TRACK_INSET_PX } : prev,
      )
      return
    }
    const trackHeight = Math.max(24, clientHeight - TRACK_INSET_PX * 2)
    const proportional = Math.round((clientHeight / scrollHeight) * trackHeight)
    const thumbHeight = Math.max(MIN_THUMB_PX, Math.min(MAX_THUMB_PX, proportional))
    const travel = Math.max(1, trackHeight - thumbHeight)
    const thumbTop = TRACK_INSET_PX + (scrollTop / maxScroll) * travel
    setMetrics((prev) =>
      prev.overflow &&
      prev.thumbHeight === thumbHeight &&
      Math.abs(prev.thumbTop - thumbTop) < 0.5
        ? prev
        : { overflow: true, thumbHeight, thumbTop },
    )
  }, [])

  useLayoutEffect(() => {
    syncMetrics()
    const el = viewportRef.current
    const content = contentRef.current
    if (!el) return

    let pendingRaf = 0
    const schedule = () => {
      if (!pendingRaf) {
        pendingRaf = requestAnimationFrame(() => {
          pendingRaf = 0
          syncMetrics()
        })
      }
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(el)
    if (content) ro?.observe(content)

    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null
    mo?.observe(content ?? el, { childList: true, subtree: true })

    return () => {
      if (pendingRaf) cancelAnimationFrame(pendingRaf)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [syncMetrics])

  useEffect(
    () => () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    },
    [],
  )

  const handleScroll = () => {
    syncMetrics()
    setScrolling(true)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setScrolling(false), 900)
  }

  return (
    <div className={cn('group/scroll relative min-h-0 overflow-hidden', className)}>
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className={cn(
          'zuno-scrollbar-hide w-full overflow-y-auto overscroll-contain',
          !autoHeight && 'h-full',
          viewportClassName,
        )}
      >
        <div ref={contentRef} className="min-w-0">
          {children}
        </div>
      </div>

      {metrics.overflow && (
        <div
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return
            const el = viewportRef.current
            if (!el) return
            const rect = e.currentTarget.getBoundingClientRect()
            const clickY = e.clientY - rect.top - TRACK_INSET_PX - metrics.thumbHeight / 2
            const trackHeight = Math.max(24, el.clientHeight - TRACK_INSET_PX * 2)
            const travel = Math.max(1, trackHeight - metrics.thumbHeight)
            const ratio = Math.max(0, Math.min(1, clickY / travel))
            el.scrollTo({ top: ratio * (el.scrollHeight - el.clientHeight), behavior: 'smooth' })
          }}
          className="absolute inset-y-0 right-0.5 z-10 w-2.5 select-none"
        >
          <div
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const el = viewportRef.current
              if (!el) return
              const trackHeight = Math.max(24, el.clientHeight - TRACK_INSET_PX * 2)
              const travel = Math.max(1, trackHeight - metrics.thumbHeight)
              dragStateRef.current = {
                pointerId: e.pointerId,
                startY: e.clientY,
                startScrollTop: el.scrollTop,
                maxScroll: Math.max(1, el.scrollHeight - el.clientHeight),
                travel,
              }
              setDragging(true)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const drag = dragStateRef.current
              if (!drag || drag.pointerId !== e.pointerId) return
              const el = viewportRef.current
              if (!el) return
              const deltaY = e.clientY - drag.startY
              el.scrollTop = drag.startScrollTop + (deltaY / drag.travel) * drag.maxScroll
            }}
            onPointerUp={(e) => {
              if (dragStateRef.current?.pointerId === e.pointerId) {
                dragStateRef.current = null
                setDragging(false)
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
              }
            }}
            onPointerCancel={() => {
              dragStateRef.current = null
              setDragging(false)
            }}
            style={{
              height: metrics.thumbHeight,
              transform: `translateY(${metrics.thumbTop}px)`,
              backgroundColor: dragging
                ? 'var(--primary)'
                : 'color-mix(in srgb, var(--primary) 42%, transparent)',
            }}
            className={cn(
              'mx-auto rounded-full transition-[width,opacity,background-color] duration-150',
              dragging
                ? 'w-[4.5px] opacity-100 cursor-grabbing'
                : scrolling
                  ? 'w-[3.5px] opacity-85 cursor-grab hover:w-[4.5px] hover:opacity-100'
                  : 'w-[3px] opacity-35 cursor-grab group-hover/scroll:opacity-80 hover:w-[4.5px] hover:opacity-100',
            )}
          />
        </div>
      )}
    </div>
  )
}
