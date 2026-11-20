import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Unexpected workspace error.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workspace ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-canvas)] p-6 text-[var(--text-primary)]">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-popover)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold">
                  Something went wrong
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  The workspace encountered an error syncing data.
                </p>
              </div>
            </div>
            <p className="mt-4 max-h-36 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 font-mono text-[11px] text-[var(--text-secondary)] break-all">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
