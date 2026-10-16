import type { GameCfg } from "./engine";
import { calibrate, forecast, type Forecast } from "./forecast";

export interface RunRequest {
  cfg: GameCfg;
  /** Expected points (away, home) the calibration should hit. */
  target: [number, number];
  n: number;
  seed: number;
  line?: { spreadHome: number | null; total: number | null };
}
export interface RunResult { cfg: GameCfg; forecast: Forecast; calibrated: [number, number] }

/** Calibrate and forecast in a Web Worker so the page stays responsive; falls back to the main thread if workers are unavailable. */
export function runForecast(req: RunRequest): Promise<RunResult> {
  const local = (): RunResult => {
    const cal = calibrate(req.cfg, req.target);
    return { cfg: cal.cfg, forecast: forecast(cal.cfg, req.n, req.seed, req.line), calibrated: cal.mean };
  };
  if (typeof Worker === "undefined") return Promise.resolve(local());
  return new Promise<RunResult>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(local());
      return;
    }
    const done = (r: RunResult) => { worker.terminate(); resolve(r); };
    worker.onmessage = (e: MessageEvent<RunResult>) => done(e.data);
    worker.onerror = () => { worker.terminate(); resolve(local()); };
    worker.postMessage(req);
  });
}
