import { Component, useCallback, useEffect, useRef, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { setLifecycle, recordDiag } from "./boot";
import { DataError, fetchData, warm } from "./data/load";
import { loadWithRecovery, type ChunkMemo } from "./chunkRetry";
import { StateNotice } from "./components/StateNotice";
import { anyOptionalFailed } from "./data/optional";

/** Past this long the loading line says so, instead of leaving a quiet screen. Nothing reloads and nothing is cancelled: a slow connection is not a failure. */
const SLOW_MS = 8_000;
const codeMemo: ChunkMemo = { url: null };
const NAV = ["Games", "Teams", "Rankings", "Analytics", "More"];

/** What the visitor sees before the board: the site's name and its five destinations, and one line about what is happening. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="boot-shell" data-testid="boot-shell">
      <header className="bs-head">
        <img src="/apple-touch-icon.png" alt="" width="34" height="34" />
        <span>Football Watchability</span>
      </header>
      <nav className="bs-nav" aria-label="Primary (loading)">
        {NAV.map((n) => <span key={n}>{n}</span>)}
      </nav>
      <main className="bs-main">{children}</main>
    </div>
  );
}

const failureText = (e: unknown) =>
  e instanceof DataError && e.kind === "invalid"
    ? "This week's games came back in a form the site could not read."
    : e instanceof DataError && e.kind === "http"
      ? "The server could not send this week's games right now."
      : "The connection did not finish in time, or dropped.";

/**
 * Startup: show the shell at once, fetch the week's slate (the one thing the board cannot be drawn without), then load the app. The slate has its own
 * bounded retries inside fetchData; if they run out the visitor gets a Retry button, which asks again (it never reloads the page by itself).
 */
export function Bootstrap() {
  const [phase, setPhase] = useState<"loading" | "failed" | "ready">("loading");
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [Root, setRoot] = useState<ComponentType | null>(null);
  const run = useRef(0);
  const warmed = useRef(false);

  const start = useCallback(() => {
    const mine = ++run.current;
    const ctl = new AbortController();
    setPhase("loading");
    setSlow(false);
    setError(null);
    setLifecycle("loading");
    const timer = setTimeout(() => mine === run.current && setSlow(true), SLOW_MS);
    // The optional files are asked for now, in parallel (a failure here is the app's business later, not startup's).
    if (!warmed.current) {
      warmed.current = true;
      warm("results");
      warm("broadcast-checks");
    }
    // The week's slate first, and only then the app's code: the app reads the slate while it loads, so a module that loaded while the slate was
    // still failing would be remembered by the browser as failed for good. With the slate in hand, loading the code cannot depend on the network again.
    fetchData("slate", { signal: ctl.signal })
      .then(() => loadWithRecovery(() => import("./AppRoot"), codeMemo))
      .then((m) => {
        if (mine !== run.current) return;
        setRoot(() => m.default);
        setPhase("ready");
        setLifecycle(anyOptionalFailed() ? "degraded" : "ready");
      })
      .catch((e) => {
        if (mine !== run.current || (e instanceof DataError && e.kind === "aborted")) return;
        recordDiag("startup", e);
        setError(e);
        setPhase("failed");
        setLifecycle("failed");
      })
      .finally(() => clearTimeout(timer));
    return () => { run.current++; ctl.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => start(), [start]);

  if (phase === "ready" && Root) return <Root />;
  if (phase === "failed") {
    const chunk = !(error instanceof DataError);
    return (
      <Shell>
        <StateNotice
          kind="failed"
          title="We couldn't load this week's games."
          actions={
            chunk ? (
              <button type="button" className="primary" onClick={() => location.reload()}>Refresh the page</button>
            ) : (
              <button type="button" className="primary" onClick={() => start()}>Retry</button>
            )
          }
        >
          {chunk ? "The site's code could not be loaded. It may have been updated: refresh the page to get the latest version." : failureText(error)}
        </StateNotice>
      </Shell>
    );
  }
  return (
    <Shell>
      <StateNotice kind="loading" title="Loading this week's games…">
        {slow ? "Still connecting. This is taking longer than usual." : "One moment while the board loads."}
      </StateNotice>
    </Shell>
  );
}

/** The last fallback: anything that throws while rendering, outside the board's own regions, ends here and not in a blank page. */
export class RootBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDiag("root", `${error.message} ${info.componentStack?.split("\n")[1]?.trim() ?? ""}`);
    setLifecycle("failed");
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="region-failed">
          <StateNotice
            kind="failed"
            title="Something went wrong loading Football Watchability."
            actions={
              <>
                <button type="button" className="primary" onClick={() => { setLifecycle("loading"); this.setState((s) => ({ failed: false, attempt: s.attempt + 1 })); }}>Try again</button>
                <button type="button" onClick={() => location.reload()}>Reload the page</button>
              </>
            }
          >
            Your place on the site is not lost: try again first, and reload if that does not help.
          </StateNotice>
        </div>
      );
    }
    return <div key={this.state.attempt} style={{ display: "contents" }}>{this.props.children}</div>;
  }
}
