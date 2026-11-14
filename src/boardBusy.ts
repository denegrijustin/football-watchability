import { useSyncExternalStore } from "react";

/**
 * Is the reader in the middle of something on the board: the pointer is over a card, a card has keyboard focus, or a card is expanded? While they are,
 * the board holds its order: a live score changing must not move the card they are reading. It settles to the fresh order the moment they step away.
 */
let hovering = false;
let focused = false;
let busy = false;
const listeners = new Set<() => void>();
let wired = false;

const expanded = () => !!document.querySelector(".board-section .game-card.expanded");
const inCard = (t: EventTarget | null) => t instanceof Element && !!t.closest(".board-section .game-card");
function update() {
  const next = hovering || focused || expanded();
  if (next === busy) return;
  busy = next;
  listeners.forEach((l) => l());
}
function wire() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("pointerover", (e) => { if (e.pointerType !== "touch") { hovering = inCard(e.target); update(); } }, { passive: true });
  document.addEventListener("pointerleave", () => { hovering = false; update(); }, { passive: true });
  document.addEventListener("focusin", (e) => { focused = inCard(e.target); update(); });
  document.addEventListener("focusout", () => { focused = false; update(); });
  // A card opening or closing changes the class, not an event: watch the board for it.
  new MutationObserver(update).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
}
/** True while the reader is hovering, focused on or has expanded a card. */
export function useBoardBusy(): boolean {
  wire();
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => busy, () => false);
}
