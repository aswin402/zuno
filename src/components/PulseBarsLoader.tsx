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
 * Uses the shared `.zuno-loader2-bar` keyframes defined in `src/index.css`
 * so mounting many rows injects zero runtime `<style>` tags.
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
  return (
    <div
      className={`inline-flex items-center ${className}`}
      style={{ gap, height }}
      role="status"
      aria-label={paused ? 'Paused' : 'Playing'}
    >
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          className={paused ? '' : 'zuno-loader2-bar'}
          style={{
            width,
            height: paused ? '35%' : '100%',
            background: color,
            borderRadius: rounded ? 9999 : 2,
            animationDuration: paused ? undefined : `${speed}s`,
            animationDelay: paused ? undefined : `${(i / barCount) * speed * 0.6}s`,
          }}
        />
      ))}
    </div>
  )
}

export default Loader2
