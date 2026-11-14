/**
 * A test seam: a test sets window.__fbFault = "root" | "board" | "gc" to make that region throw while it renders, then clears it and
 * presses the region's Retry. Nothing sets it in normal use.
 */
export function fault(region: "root" | "board" | "gc") {
  if ((globalThis as { __fbFault?: string }).__fbFault === region) throw new Error(`Injected ${region} fault`);
}
