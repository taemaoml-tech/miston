import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="flex h-full items-center justify-center bg-ios-bg p-6 text-ios-label">
        <div className="ios-glass w-full max-w-md rounded-[28px] border p-6 shadow-soft">
          <h1 className="text-xl font-bold">Щось пішло не так</h1>
          <p className="mt-2 text-sm text-ios-secondary">
            Не вдалося відобразити Miston. Спробуйте оновити сторінку.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-ios-fill/10 p-3 text-[11px] leading-4 text-ios-secondary">
            {error.message}
          </pre>
          <button type="button" className="primary-btn mt-5 w-full" onClick={() => window.location.reload()}>
            Оновити
          </button>
        </div>
      </main>
    );
  }
}
