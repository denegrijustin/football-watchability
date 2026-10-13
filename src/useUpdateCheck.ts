import { useEffect, useState } from "react";

/**
 * Whether a newer version of the site has been published since this page loaded. The page knows the id of the build it came from and
 * asks /version.json (never cached) for the current one: when the page is opened again, when it comes back to the foreground and every
 * five minutes. A page left open across a deploy then says so, instead of failing when it reaches for a file that is gone.
 */
export function useUpdateCheck() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch("/version.json", { cache: "no-store" });
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return;
        const { id } = (await r.json()) as { id?: string };
        if (!stop && id && id !== __BUILD_ID__) setStale(true);
      } catch {
        /* offline: nothing to say */
      }
    };
    void check();
    const timer = setInterval(() => !document.hidden && void check(), 5 * 60_000);
    const visible = () => !document.hidden && void check();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return stale;
}
