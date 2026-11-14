/** Board data lives in /data/<name>.json (built from src/data by vite.config.ts), fetched rather than bundled. */
import { assertBroadcastChecks, assertResults, assertSlate } from "./validate";

/** Why a data request failed: it timed out, the network dropped, the server said no, the answer was not what the app expects, or the caller gave up. */
export type FailKind = "timeout" | "network" | "http" | "invalid" | "aborted";
export class DataError extends Error {
  kind: FailKind;
  status?: number;
  constructor(kind: FailKind, message: string, status?: number) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
    this.status = status;
  }
}

/** How a request is tried: a bounded number of attempts, each with its own deadline, with jittered, bounded waits between them. */
export type Policy = { attempts: number; timeoutMs: number; baseDelayMs: number; maxDelayMs: number };
export const POLICY = {
  /** The first screen cannot be drawn without it. */
  essential: { attempts: 3, timeoutMs: 15_000, baseDelayMs: 500, maxDelayMs: 4_000 },
  /** The board works without it (broadcast checks, past results): fewer, shorter tries, so a bad file never holds anything up for long. */
  optional: { attempts: 2, timeoutMs: 10_000, baseDelayMs: 800, maxDelayMs: 3_000 },
  /** Fetched when a view asks for it (the performance, ratings and picks data): the same patience the site always had. */
  deferred: { attempts: 3, timeoutMs: 15_000, baseDelayMs: 400, maxDelayMs: 3_000 },
} as const satisfies Record<string, Policy>;
/** Tests can shorten the deadlines (window.__fbPolicy = { essential: { timeoutMs: 800 } }); nothing else reads it. */
const tuned = (kind: keyof typeof POLICY): Policy => ({ ...POLICY[kind], ...((globalThis as { __fbPolicy?: Record<string, Partial<Policy>> }).__fbPolicy?.[kind] ?? {}) });

type Opts = { policy?: keyof typeof POLICY; signal?: AbortSignal };
/** Only these files are checked against the shape the app relies on; every other dataset is read as before. */
const VALIDATE: Record<string, (j: unknown) => void> = { slate: assertSlate, results: assertResults, "broadcast-checks": assertBroadcastChecks };
const POLICY_OF: Record<string, keyof typeof POLICY> = { slate: "essential", results: "optional", "broadcast-checks": "optional" };

type Entry = { promise: Promise<unknown>; ctl: AbortController; waiters: number };
const cache = new Map<string, Entry>();

/**
 * The Denver Broncos are called the Denver Donkeys on this site. Only the words people read change: ids, logo ids, abbreviations
 * and every feed key stay as they are, so the team is still matched, logoed and scored as the Broncos underneath.
 */
const DONKEYS: [RegExp, string][] = [
  [/Denver Broncos/g, "Denver Donkeys"],
  [/\bBroncos\b/g, "Donkeys"],
];
export const donkeys = (s: string) => (s.includes("Broncos") ? DONKEYS.reduce((t, [re, to]) => t.replace(re, to), s) : s);
/** CBS and NBC games are listed as the network alone; the Paramount+ and Peacock listings are not shown. */
const noParamount = (s: string) => (s.includes("Paramount+") || s.includes("Peacock") ? s.replace(/(CBS|NBC)\s*\/\s*(Paramount\+|Peacock)/g, "$1") : s);
export function rename<T>(v: T): T {
  if (typeof v === "string") return noParamount(donkeys(v)) as T;
  if (Array.isArray(v)) return v.map(rename) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = rename(x);
    return out as T;
  }
  return v;
}

const retryable = (e: DataError) => e.kind === "timeout" || e.kind === "network" || (e.kind === "http" && (e.status === 408 || e.status === 429 || (e.status ?? 0) >= 500));

/** A pause that a cancel ends at once, and that leaves no timer behind. */
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DataError("aborted", "cancelled"));
    const t = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, ms);
    const stop = () => { clearTimeout(t); reject(new DataError("aborted", "cancelled")); };
    signal.addEventListener("abort", stop, { once: true });
  });
}

/** One data file under a policy. A retry skips the browser's cache in case a bad copy is stuck in it; an invalid answer is never retried. */
async function getJson(name: string, policy: Policy, signal: AbortSignal, validate?: (j: unknown) => void): Promise<unknown> {
  let last: DataError = new DataError("network", `Could not load ${name}`);
  for (let i = 0; i < policy.attempts; i++) {
    if (signal.aborted) throw new DataError("aborted", `Loading ${name} was cancelled`);
    const ctl = new AbortController();
    let timedOut = false;
    const stop = () => ctl.abort();
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, policy.timeoutMs);
    try {
      const res = await fetch(`/data/${name}.json`, { signal: ctl.signal, ...(i ? { cache: "no-store" as const } : {}) });
      if (!res.ok) throw new DataError("http", `Could not load ${name} (${res.status})`, res.status);
      let json: unknown;
      try {
        json = await res.json();
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        throw new DataError("invalid", `${name} is not valid JSON`);
      }
      try {
        validate?.(json);
      } catch (e) {
        throw e instanceof DataError ? e : new DataError("invalid", `${name} has an unexpected shape`);
      }
      return json;
    } catch (e) {
      last =
        e instanceof DataError ? e
        : e instanceof DOMException && e.name === "AbortError" ? (timedOut ? new DataError("timeout", `Loading ${name} timed out`) : new DataError("aborted", `Loading ${name} was cancelled`))
        : new DataError("network", `Could not load ${name}`);
      if (last.kind === "aborted" || !retryable(last) || i === policy.attempts - 1) throw last;
      // Bounded exponential wait with jitter, so many visitors do not retry in step.
      const wait = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** i) * (0.75 + Math.random() * 0.5);
      await pause(wait, signal);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    }
  }
  throw last;
}

/**
 * A data file, shared: everyone who asks for it while it is on its way gets the same request, a failed one is forgotten so the next ask tries
 * again, and a request nobody is waiting for any more (every caller that passed a signal has cancelled) is cancelled.
 */
export function fetchData<T>(name: string, opts: Opts = {}): Promise<T> {
  let entry = cache.get(name);
  if (!entry) {
    const ctl = new AbortController();
    const policy = tuned(opts.policy ?? POLICY_OF[name] ?? "deferred");
    const promise = getJson(name, policy, ctl.signal, VALIDATE[name]).then((j) => rename(j));
    entry = { promise, ctl, waiters: 0 };
    const mine = entry;
    promise.catch(() => { if (cache.get(name) === mine) cache.delete(name); });
    cache.set(name, entry);
  }
  const e = entry;
  const { signal } = opts;
  if (!signal) {
    e.waiters += 1;
    return e.promise as Promise<T>;
  }
  if (signal.aborted) return Promise.reject(new DataError("aborted", `Loading ${name} was cancelled`));
  e.waiters += 1;
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      e.waiters -= 1;
      if (e.waiters <= 0) e.ctl.abort();
      reject(new DataError("aborted", `Loading ${name} was cancelled`));
    };
    signal.addEventListener("abort", cancel, { once: true });
    e.promise.then(
      (v) => { signal.removeEventListener("abort", cancel); resolve(v as T); },
      (err) => { signal.removeEventListener("abort", cancel); reject(err); },
    );
  });
}

/** The same file again, ignoring what was fetched earlier (for views that keep up with the hourly rebuild while games are on). */
export function refetchData<T>(name: string, opts: Opts = {}): Promise<T> {
  cache.delete(name);
  return fetchData<T>(name, opts);
}
