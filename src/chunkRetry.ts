// A dynamic import() that fails (a dropped connection, or a file that a deploy removed) is remembered as failed by the browser: asking for the
// same address again fails at once, without touching the network. So a Retry that only calls import() again can never succeed. The error does
// name the address, though, and asking for that file under a different query string is a fresh request: that is how a Retry gets a real second try.
// If the file is really gone (the site was updated), the second try fails too, and the person is told to refresh.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ChunkMemo = { url: string | null };

/** The file address a failed import names (Chrome and Firefox include it; Safari does not). */
export function failedUrl(e: unknown): string | null {
  const m = /https?:\/\/[^\s'")]+\.js/.exec(String((e as { message?: string })?.message ?? e));
  return m ? m[0] : null;
}

async function once<M>(load: () => Promise<M>, memo: ChunkMemo): Promise<M> {
  if (memo.url) {
    const url = memo.url;
    try {
      const m = (await import(/* @vite-ignore */ `${url}?r=${Date.now()}`)) as { default?: unknown };
      if (m.default) return m as M; // the file we wanted (a failing neighbour would not have a default export)
    } catch {
      /* fall through to the normal import */
    }
    memo.url = null;
  }
  try {
    return await load();
  } catch (e) {
    memo.url = failedUrl(e);
    throw e;
  }
}

/** Loads a module: tried, and tried once more after a short pause (the second try is a fresh request, see above). */
export async function loadWithRecovery<M>(load: () => Promise<M>, memo: ChunkMemo): Promise<M> {
  try {
    return await once(load, memo);
  } catch {
    await sleep(700);
    return once(load, memo);
  }
}
