import { Component, type ReactNode } from "react";

/** Keeps one tab's failure (a chunk that did not load, a bad data file) from blanking the whole board. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="ol-note" role="alert">
        This view could not load. <button type="button" className="reset" onClick={() => this.setState({ failed: false })}>Try again</button>
      </p>
    );
  }
}
