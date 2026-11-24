import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useScrollViewport } from '@/components/CompactScrollArea'
import { cn } from '@/lib/utils'
import type { ScrollRevealStyleId } from '@/lib/appearance'

interface VirtualTrackListProps<T> {
  items: T[]
  getKey: (item: T, index: number) => string
  estimateRowHeight: number
  /** Extra rows rendered above and below the viewport to eliminate white flashes on fast scroll. */
  overscan?: number
  /** Optional explicit scroll container (defaults to enclosing CompactScrollArea viewport). */
  scrollElementRef?: RefObject<HTMLElement | null>
  /** Gap between rows in px (matches Tailwind space-y-1 = 4px). */
  gapPx?: number
  /** Optional Great UI Blur Scroll Reveal / Slide entrance animation on rows. */
  revealStyle?: ScrollRevealStyleId
  renderItem: (item: T, index: number) => ReactNode
}

const VIRTUALIZE_THRESHOLD = 45

/**
 * Zero-dependency windowed list virtualizer built specifically for Zuno's song & queue lists.
 * Keeps the live DOM to ~28 rows whether the library holds 50 or 20,000 tracks, while using
 * clean top/bottom spacer blocks so dropdown menus pop freely without stacking-context clipping.
 */
export function VirtualTrackList<T>({
  items,
  getKey,
  estimateRowHeight,
  overscan = 8,
  scrollElementRef,
  gapPx = 4,
  revealStyle = 'none',
  renderItem,
}: VirtualTrackListProps<T>) {
  const ctxViewport = useScrollViewport()
  const viewportRef = scrollElementRef ?? ctxViewport
  const listRef = useRef<HTMLDivElement>(null)
  const sampleRef = useRef<HTMLDivElement>(null)

  const [measuredStride, setMeasuredStride] = useState<number>(estimateRowHeight + gapPx)
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(items.length, 32),
  })

  // Keep estimate synced when density/overline/fontSize changes
  useEffect(() => {
    setMeasuredStride(estimateRowHeight + gapPx)
  }, [estimateRowHeight, gapPx])

  const shouldVirtualize = items.length > VIRTUALIZE_THRESHOLD && Boolean(viewportRef)

  const recomputeRange = useCallback(() => {
    if (!shouldVirtualize) return
    const vp = viewportRef?.current
    const listEl = listRef.current
    if (!vp || !listEl) return

    const vpRect = vp.getBoundingClientRect()
    const listRect = listEl.getBoundingClientRect()
    // Offset of list top relative to the scroll viewport's content top
    const listOffsetInVp = listRect.top - vpRect.top + vp.scrollTop
    const relativeScrollTop = Math.max(0, vp.scrollTop - listOffsetInVp)
    const viewHeight = vp.clientHeight || 720
    const stride = Math.max(32, measuredStride)

    const rawStart = Math.floor(relativeScrollTop / stride)
    const visibleCount = Math.ceil(viewHeight / stride)
    const nextStart = Math.max(0, rawStart - overscan)
    const nextEnd = Math.min(items.length, rawStart + visibleCount + overscan)

    setRange((prev) =>
      prev.start === nextStart && prev.end === nextEnd
        ? prev
        : { start: nextStart, end: nextEnd },
    )
  }, [shouldVirtualize, viewportRef, measuredStride, overscan, items.length])

  // Self-calibrate exact row height once from the first rendered row
  useLayoutEffect(() => {
    if (!shouldVirtualize) return
    const sample = sampleRef.current
    if (!sample) return
    const h = Math.round(sample.getBoundingClientRect().height)
    if (h >= 32 && Math.abs(h + gapPx - measuredStride) > 1) {
      setMeasuredStride(h + gapPx)
    }
  }, [shouldVirtualize, gapPx, measuredStride, estimateRowHeight, items.length])

  useEffect(() => {
    if (!shouldVirtualize) return
    recomputeRange()

    const vp = viewportRef?.current
    if (!vp) return

    let rafId = 0
    const onScrollOrResize = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        recomputeRange()
      })
    }

    vp.addEventListener('scroll', onScrollOrResize, { passive: true })
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScrollOrResize) : null
    ro?.observe(vp)

    return () => {
      vp.removeEventListener('scroll', onScrollOrResize)
      ro?.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [shouldVirtualize, viewportRef, recomputeRange])

  const revealCls =
    revealStyle === 'blur-reveal'
      ? 'zuno-reveal-blur'
      : revealStyle === 'slide-fade'
        ? 'zuno-reveal-slide'
        : ''

  if (!shouldVirtualize) {
    return (
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={getKey(item, idx)} className={revealCls || undefined}>
            {renderItem(item, idx)}
          </div>
        ))}
      </div>
    )
  }

  const start = Math.min(range.start, items.length)
  const end = Math.min(Math.max(range.end, start), items.length)
  const topSpacer = start * measuredStride
  const bottomSpacer = Math.max(0, (items.length - end) * measuredStride)
  const visible = items.slice(start, end)

  return (
    <div ref={listRef} className="relative">
      {topSpacer > 0 && <div style={{ height: topSpacer }} aria-hidden="true" />}
      <div className="space-y-1">
        {visible.map((item, localIdx) => {
          const absIdx = start + localIdx
          return (
            <div
              key={getKey(item, absIdx)}
              ref={localIdx === 0 ? sampleRef : undefined}
              className={cn('zuno-vrow', revealCls)}
            >
              {renderItem(item, absIdx)}
            </div>
          )
        })}
      </div>
      {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} aria-hidden="true" />}
    </div>
  )
}
