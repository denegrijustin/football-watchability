import { Component, Fragment, type ReactNode } from "react";
import { recordDiag } from "../boot";
import { resetFailedViews } from "../lazyView";
import { StateNotice } from "./StateNotice";

/**
 * Keeps one region's failure (a view's file that did not load, a bad data file, a render error) from taking the page with it. The region shows what
 * failed, in plain words, with Retry (which resets the region, and any view file that failed, and renders it afresh) and, separately, a deliberate
 * "Reload the page". It resets by itself when the section changes (resetKey).
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string; title?: string; region?: string; onRetry?: () => void },
  { failed: boolean; why: string; attempt: number }
> {
  state = { failed: false, why: "", attempt: 0 };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, why: String((error as Error)?.message ?? error).slice(0, 120) };
  }
  componentDidCatch(error: Error) {
    recordDiag(`region:${this.props.region ?? "view"}`, error);
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, why: "" });
  }
  retry = () => {
    resetFailedViews();
    this.props.onRetry?.();
    this.setState((s) => ({ failed: false, why: "", attempt: s.attempt + 1 }));
  };
  render() {
    if (!this.state.failed) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return (
      <div className="region-failed" data-region={this.props.region ?? "view"}>
        <StateNotice
          kind="failed"
          title={this.props.title ?? "This view could not load."}
          actions={
            <>
              <button type="button" className="primary" onClick={this.retry}>Retry</button>
              <button type="button" onClick={() => location.reload()}>Reload the page</button>
            </>
          }
        >
          The rest of the site still works: use the menu to go somewhere else, or try again.
          {this.state.why && <small className="rb-why"> ({this.state.why})</small>}
        </StateNotice>
      </div>
    );
  }
}
