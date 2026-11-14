import { Component, createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { recordDiag } from "../boot";
import { logos, slate } from "../data";
import { fault } from "../fault";
import { StateNotice } from "./StateNotice";

// ---------- open/close from anywhere ----------
/** A game the board doesn't carry any more (earlier weeks), described just enough to open. */
export type GameStub = {
  league: "NFL" | "CFB";
  date: string;
  matchup: string;
  teams: { name: string; abbr: string; logoId: string; color?: string | null; score: number }[];
};
const Ctx = createContext<(espnId: string, stub?: GameStub) => void>(() => {});
export const useOpenGame = () => useContext(Ctx);

type GcProps = { espnId: string | null; stub?: GameStub; onClose: () => void };

// ---------- loading the Game Center's code ----------
// The Game Center is the largest piece of the app, so its code loads the first time a game is opened (or when the page is idle).
// Two paths, kept apart: a PRELOAD is speculative (quiet: a failure is noted and forgotten, nothing is shown, nothing reloads), and an OPEN
// is something a person is waiting for (a visible loading state, one retry for a dropped connection, then a message with Retry and Close).
// Neither ever reloads the page: if the site was updated and the old file is gone, the person is asked to refresh, and chooses.
let loaded: ComponentType<GcProps> | null = null;
const IMPORT_TIMEOUT_MS = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function preloadGameCenter() {
  if (loaded) return;
  import("./GameCenter").then((m) => { loaded = m.default as ComponentType<GcProps>; }, (e) => recordDiag("preload:gamecenter", e));
}

function importGameCenter(): Promise<ComponentType<GcProps>> {
  if (loaded) return Promise.resolve(loaded);
  const attempt = () => import("./GameCenter").then((m) => (loaded = m.default as ComponentType<GcProps>));
  // Tried once more after a pause (a first failure is often a dropped connection), and never left pending: after the deadline it is a failure.
  const tries = attempt().catch(() => sleep(700).then(attempt));
  const deadline = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Loading the Game Center timed out")), IMPORT_TIMEOUT_MS));
  return Promise.race([tries, deadline]);
}

/** Has the site been updated since this page loaded? (The page's own script has a different name in the current index.html.) */
async function siteUpdated(): Promise<boolean> {
  try {
    const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src");
    if (!mine) return false;
    const res = await fetch("/", { cache: "no-store" });
    if (!res.ok) return false;
    const now = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(await res.text())?.[1];
    return !!now && now !== mine;
  } catch {
    return false;
  }
}

// ---------- the dialog shell for loading and failure ----------
/** The same dialog the Game Center opens in, with its close button, for while it loads or when it cannot. */
function GcShell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      try { d.showModal(); } catch { /* not attached yet */ }
    }
    return () => { try { d?.close(); } catch { /* already closed */ } };
  }, []);
  return (
    <dialog ref={ref} className="gc gc-shell" aria-label="Game Center" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <button type="button" className="gc-close" onClick={onClose} aria-label="Close Game Center">×</button>
      <div className="gcs-card">{children}</div>
    </dialog>
  );
}

function Matchup({ id, stub }: { id: string; stub?: GameStub }) {
  const g = slate.games.find((x) => x.espnId === id);
  const teams = stub?.teams ?? g?.teams;
  if (!teams || teams.length < 2) return null;
  const [away, home] = teams;
  const logo = (t: { logoId?: string }) => (t.logoId ? logos[t.logoId] : undefined);
  return (
    <div className="gcs-match" data-testid="gc-loading-matchup">
      {logo(away) && <img src={logo(away)} alt="" />}
      <span>{away.name}</span>
      <span aria-hidden="true">at</span>
      <span>{home.name}</span>
      {logo(home) && <img src={logo(home)} alt="" />}
    </div>
  );
}

function GcLoading({ id, stub, onClose }: { id: string; stub?: GameStub; onClose: () => void }) {
  return (
    <GcShell onClose={onClose}>
      <Matchup id={id} stub={stub} />
      <StateNotice kind="loading" title="Opening Game Center…" />
      <div className="gcs-skel" aria-hidden="true"><i /><i /><i /></div>
    </GcShell>
  );
}

function GcFailed({ id, stub, updated, attempts, onRetry, onClose }: { id: string; stub?: GameStub; updated: boolean; attempts: number; onRetry: () => void; onClose: () => void }) {
  return (
    <GcShell onClose={onClose}>
      <Matchup id={id} stub={stub} />
      <StateNotice
        kind="failed"
        title="The Game Center could not load."
        actions={
          <>
            <button type="button" className="primary" onClick={onRetry}>Retry</button>
            {(updated || attempts > 1) && <button type="button" onClick={() => location.reload()}>Refresh the application</button>}
            <button type="button" onClick={onClose}>Close</button>
          </>
        }
      >
        {updated ? "Game Center was updated. Refresh the application to load the latest version." : "Check your connection and try again. The board behind this window is unchanged."}
      </StateNotice>
    </GcShell>
  );
}

/** A Game Center that fails while it renders must never take the page with it: this region shows the failure, with Retry and Close. */
class GcBoundary extends Component<{ children: ReactNode; id: string; stub?: GameStub; onClose: () => void }, { failed: boolean; why: string; attempt: number }> {
  state = { failed: false, why: "", attempt: 0 };
  static getDerivedStateFromError(err: unknown) {
    return { failed: true, why: String((err as Error)?.message ?? err).slice(0, 120) };
  }
  componentDidCatch(err: Error) {
    recordDiag("gamecenter:render", err);
  }
  render() {
    if (!this.state.failed) return <div key={this.state.attempt} style={{ display: "contents" }}>{this.props.children}</div>;
    return (
      <GcShell onClose={this.props.onClose}>
        <Matchup id={this.props.id} stub={this.props.stub} />
        <StateNotice
          kind="failed"
          title="The Game Center ran into a problem."
          actions={
            <>
              <button type="button" className="primary" onClick={() => this.setState((s) => ({ failed: false, why: "", attempt: s.attempt + 1 }))}>Retry</button>
              <button type="button" onClick={this.props.onClose}>Close</button>
            </>
          }
        >
          The board behind this window still works.
          {this.state.why && <small className="rb-why"> ({this.state.why})</small>}
        </StateNotice>
      </GcShell>
    );
  }
}

type Open = { id: string; stub?: GameStub };

export function GameCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [Comp, setComp] = useState<ComponentType<GcProps> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [fail, setFail] = useState({ attempts: 0, updated: false });
  const token = useRef(0); // a load that finishes after the person closed (or reopened) is ignored
  const opener = useRef<HTMLElement | null>(null);

  const load = useCallback(() => {
    const mine = ++token.current;
    setStatus("loading");
    importGameCenter().then(
      (c) => { if (mine === token.current) { setComp(() => c); setStatus("ready"); } },
      async (e) => {
        recordDiag("gamecenter:open", e);
        const updated = await siteUpdated();
        if (mine !== token.current) return;
        setFail((f) => ({ attempts: f.attempts + 1, updated }));
        setStatus("failed");
      },
    );
  }, []);

  const openGame = useCallback((id: string, stub?: GameStub) => {
    if (!opener.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) opener.current = document.activeElement;
    setOpen({ id, stub });
    if (loaded) { setComp(() => loaded); setStatus("ready"); token.current++; }
    else { setFail({ attempts: 0, updated: false }); load(); }
  }, [load]);

  const close = useCallback(() => {
    token.current++;
    setOpen(null);
    const o = opener.current;
    opener.current = null;
    // Back to the card or button the person opened it from.
    if (o) requestAnimationFrame(() => { if (o.isConnected) o.focus({ preventScroll: true }); });
  }, []);

  // A phone that slept while the code was loading wakes up with a stalled request: ask again when the page is shown.
  useEffect(() => {
    if (!open || status !== "loading") return;
    const wake = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [open, status, load]);

  const ready = status === "ready" && !!Comp;
  return (
    <Ctx.Provider value={openGame}>
      {children}
      {Comp && (
        <GcBoundary key={ready && open ? open.id : "closed"} id={open?.id ?? ""} stub={open?.stub} onClose={close}>
          <GameCenterHost Comp={Comp} espnId={ready ? open?.id ?? null : null} stub={open?.stub} onClose={close} />
        </GcBoundary>
      )}
      {open && !ready && status === "loading" && <GcLoading id={open.id} stub={open.stub} onClose={close} />}
      {open && !ready && status === "failed" && <GcFailed id={open.id} stub={open.stub} updated={fail.updated} attempts={fail.attempts} onRetry={load} onClose={close} />}
    </Ctx.Provider>
  );
}

function GameCenterHost({ Comp, ...props }: GcProps & { Comp: ComponentType<GcProps> }) {
  if (props.espnId) fault("gc");
  return <Comp {...props} />;
}
