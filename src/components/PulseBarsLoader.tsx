import { useId } from 'react'

export interface Loader2Props {
  barCount?: number
  color?: string
  height?: number
  width?: number
  gap?: number
  speed?: number
  rounded?: boolean
  paused?: boolean
  className?: string
}

/**
 * Centered vertical pulse-bar audio indicator / loader (Loader2),
 * theme-matched to var(--primary) by default.
 */
export function Loader2({
  barCount = 5,
  color = 'var(--primary)',
  height = 18,
  width = 2.5,
  gap = 2.5,
  speed = 1,
  rounded = true,
  paused = false,
  className = '',
}: Loader2Props) {
  const uid = useId().replace(/:/g, '')
  const barClass = `ak-loader2-${uid}`

  return (
    <div
      className={`inline-flex items-center ${className}`}
      style={{ gap, height }}
      role="status"
      aria-label={paused ? 'Paused' : 'Playing'}
    >
      <style>{`
        @keyframes ${barClass}-pulse {
          0%, 100% { transform: scaleY(0.3); }
          50%      { transform: scaleY(1); }
        }
        .${barClass} {
          animation: ${barClass}-pulse ${speed}s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
      {[...Array(barCount)].map((_, i) => (
        <div
          key={i}
          className={paused ? '' : barClass}
          style={{
            width,
            height: paused ? '35%' : '100%',
            background: color,
            borderRadius: rounded ? 9999 : 2,
            animationDelay: `${(i / barCount) * speed * 0.6}s`,
          }}
        />
      ))}
    </div>
  )
}

export default Loader2
