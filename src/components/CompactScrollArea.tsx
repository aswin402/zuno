import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import { cn } from '@/lib/utils'

const MIN_THUMB_PX = 28
const MAX_THUMB_PX = 44
const TRACK_INSET_PX = 10

const ScrollViewportContext = createContext<RefObject<HTMLDivElement | null> | null>(null)

export function useScrollViewport(): RefObject<HTMLDivElement | null> | null {
  return useContext(ScrollViewportContext)
}

/**
 * Zero-rerender compact overlay scroll container.
 * Updates the pill scrollbar thumb directly via DOM refs inside rAF (0 React setState calls
 * during scroll and zero subtree MutationObserver overhead) for silky 60 FPS WebKitGTK scrolling.
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
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const hideTimerRef = useRef<number | undefined>(undefined)
  const thumbHeightRef = useRef<number>(34)
  const dragStateRef = useRef<{
    pointerId: number
    startY: number
    startScrollTop: number
    maxScroll: number
    travel: number
  } | null>(null)

  const syncDom = useCallback(() => {
    const el = viewportRef.current
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!el || !track || !thumb) return

    const { scrollTop, scrollHeight, clientHeight } = el
    const maxScroll = Math.max(0, scrollHeight - clientHeight)
    if (maxScroll <= 1 || clientHeight <= TRACK_INSET_PX * 2) {
      track.style.display = 'none'
      return
    }

    track.style.display = 'block'
    const trackHeight = Math.max(24, clientHeight - TRACK_INSET_PX * 2)
    const proportional = Math.round((clientHeight / scrollHeight) * trackHeight)
    const thumbHeight = Math.max(MIN_THUMB_PX, Math.min(MAX_THUMB_PX, proportional))
    const travel = Math.max(1, trackHeight - thumbHeight)
    const thumbTop = TRACK_INSET_PX + (scrollTop / maxScroll) * travel

    thumbHeightRef.current = thumbHeight
    thumb.style.height = `${thumbHeight}px`
    thumb.style.transform = `translate3d(0, ${thumbTop}px, 0)`
  }, [])

  const scheduleSync = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      syncDom()
    })
  }, [syncDom])

  useLayoutEffect(() => {
    syncDom()
    const el = viewportRef.current
    const content = contentRef.current
    if (!el) return

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null
    ro?.observe(el)
    if (content) ro?.observe(content)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      ro?.disconnect()
    }
  }, [syncDom, scheduleSync])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onScroll = () => {
      scheduleSync()
      const thumb = thumbRef.current
      if (thumb && thumb.dataset.scrolling !== 'true') {
        thumb.dataset.scrolling = 'true'
      }
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = window.setTimeout(() => {
        if (thumbRef.current) thumbRef.current.dataset.scrolling = 'false'
      }, 900)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [scheduleSync])

  return (
    <ScrollViewportContext.Provider value={viewportRef}>
      <div className={cn('group/scroll relative min-h-0 overflow-hidden', className)}>
        <div
          ref={viewportRef}
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

        <div
          ref={trackRef}
          style={{ display: 'none' }}
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return
            const el = viewportRef.current
            if (!el) return
            const rect = e.currentTarget.getBoundingClientRect()
            const clickY = e.clientY - rect.top - TRACK_INSET_PX - thumbHeightRef.current / 2
            const trackHeight = Math.max(24, el.clientHeight - TRACK_INSET_PX * 2)
            const travel = Math.max(1, trackHeight - thumbHeightRef.current)
            const ratio = Math.max(0, Math.min(1, clickY / travel))
            el.scrollTo({
              top: ratio * (el.scrollHeight - el.clientHeight),
              behavior: 'smooth',
            })
          }}
          className="absolute inset-y-0 right-0.5 z-10 w-2.5 select-none"
        >
          <div
            ref={thumbRef}
            data-scrolling="false"
            data-dragging="false"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const el = viewportRef.current
              if (!el) return
              const trackHeight = Math.max(24, el.clientHeight - TRACK_INSET_PX * 2)
              const travel = Math.max(1, trackHeight - thumbHeightRef.current)
              dragStateRef.current = {
                pointerId: e.pointerId,
                startY: e.clientY,
                startScrollTop: el.scrollTop,
                maxScroll: Math.max(1, el.scrollHeight - el.clientHeight),
                travel,
              }
              e.currentTarget.dataset.dragging = 'true'
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
                e.currentTarget.dataset.dragging = 'false'
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
              }
            }}
            onPointerCancel={(e) => {
              dragStateRef.current = null
              e.currentTarget.dataset.dragging = 'false'
            }}
            className="zuno-scroll-thumb mx-auto will-change-transform rounded-full"
          />
        </div>
      </div>
    </ScrollViewportContext.Provider>
  )
}
