import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/**
 * Pure OLED error boundary so any unexpected React runtime exception shows a clean
 * recovery screen instead of a dead blank window.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Unexpected playback UI error',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Zuno] UI boundary caught error:', error, info)
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: '' })
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-black px-6 text-center text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950 p-6 shadow-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Zuno
          </p>
          <h1 className="mt-2 text-lg font-semibold tracking-tight text-white">
            Something went wrong
          </h1>
          <p className="mt-2 break-words text-xs leading-relaxed text-neutral-400">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Reload Zuno
          </button>
        </div>
      </div>
    )
  }
}
