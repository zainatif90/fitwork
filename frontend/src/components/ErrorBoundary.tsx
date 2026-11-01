import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Shows a friendly message instead of a white screen when a page fails to render.
 * The usual cause: the site was updated while this tab was open, so a page file it asks for
 * no longer exists. Reloading fetches the new version.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Page failed to render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-500">FitWork may have been updated. Reloading usually fixes this.</p>
        <button onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Reload
        </button>
      </div>
    );
  }
}
