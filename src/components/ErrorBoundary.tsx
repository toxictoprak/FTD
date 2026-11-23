import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('FTD ErrorBoundary caught error:', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      let readableMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; path?: string };
        if (parsed.error) {
          readableMessage = parsed.path ? `${parsed.error} (${parsed.path})` : parsed.error;
        }
      } catch {
        // Keep raw message
      }

      return (
        <div className="min-h-screen bg-[#050608] text-white flex flex-col items-center justify-center gap-4 px-4 text-center">
          <img
            src="/assets/aistudio/IMG_0674_a69c6a83.png"
            alt="FTD"
            className="h-12 w-auto object-contain"
          />
          <h1 className="font-display text-3xl font-bold uppercase">FTD Sync Notice</h1>
          <p className="text-sm text-zinc-400 max-w-md">{readableMessage}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
          >
            Reload Platform
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
