import { createElement, lazy, type ComponentType } from "react";
import { recordDiag } from "./boot";
import { loadWithRecovery, type ChunkMemo } from "./chunkRetry";

// A lazy view that failed to load is forgotten by its own lazy() for good, so Retry needs a fresh one: each view registers a reset here.
const resets = new Set<() => void>();
/** Gives every view whose file failed to load a fresh chance to load (called by a region's Retry). */
export function resetFailedViews() {
  resets.forEach((r) => r());
}

/**
 * A view that loads the first time its tab is opened. If its file will not load (the connection dropped, or the site was updated while the page
 * was open and the old file is gone) it is tried once more, then the error reaches the view's message, which offers Retry and, separately,
 * "Reload the page". The page never reloads by itself.
 */
export function lazyView<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, name: string) {
  let failed = false;
  const memo: ChunkMemo = { url: null };
  const make = () =>
    lazy(() => {
      failed = false;
      return loadWithRecovery(load, memo)
        .catch((err) => {
          failed = true;
          recordDiag(`view:${name}`, err);
          throw err;
        });
    });
  let Inner = make();
  resets.add(() => {
    if (failed) Inner = make();
  });
  // A stable component that always renders the current lazy one.
  const View = ((props: object) => createElement(Inner as ComponentType<any>, props)) as unknown as T;
  return View;
}
