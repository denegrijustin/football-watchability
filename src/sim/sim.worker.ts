import { calibrate, forecast } from "./forecast";
import type { RunRequest, RunResult } from "./run";

self.onmessage = (e: MessageEvent<RunRequest>) => {
  const { cfg, target, n, seed, line } = e.data;
  const cal = calibrate(cfg, target);
  const fc = forecast(cal.cfg, n, seed, line);
  const msg: RunResult = { cfg: cal.cfg, forecast: fc, calibrated: cal.mean };
  (self as unknown as Worker).postMessage(msg);
};
