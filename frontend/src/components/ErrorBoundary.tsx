import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * App-level error boundary. Catches render errors, shows a friendly fallback
 * and keeps the brand shell intact instead of white-screening the whole app.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('SwasthyaFlow UI error:', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
    window.location.hash = '#/app'
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-7 text-center shadow-[var(--shadow-lift)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <span className="text-xl font-extrabold">!</span>
          </div>
          <h1 className="mt-4 text-lg font-extrabold text-ink-900">Something went wrong</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            This screen hit an unexpected error. Your data is safe — no information was sent or
            diagnosed. You can return to the dashboard and try again.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Back to dashboard
          </button>
          <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-left text-[11px] font-mono text-ink-400">
            {this.state.error.message}
          </p>
        </div>
      </div>
    )
  }
}
