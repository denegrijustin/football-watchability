import { Component, type ReactNode } from "react";

/** Keeps one tab's failure (a chunk that did not load, a bad data file) from blanking the whole board. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean; why: string }> {
  state = { failed: false, why: "" };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, why: String((error as Error)?.message ?? error).slice(0, 200) };
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false, why: "" });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="ol-note" role="alert">
        This view could not load. <button type="button" className="reset" onClick={() => location.reload()}>Reload the page</button>
        {this.state.why && <small className="gc-why"> {this.state.why}</small>}
      </p>
    );
  }
}
