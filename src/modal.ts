/**
 * Opens a <dialog> as a modal without losing the page's place. showModal()
 * jumps the document to the top in Chromium, which left people at the top of
 * the board after closing a game; this puts the scroll position back. The
 * page behind is locked while a dialog is open (see "Modals" in styles.css),
 * so it stays where it was.
 */
export function openModal(d: HTMLDialogElement) {
  const { scrollX: x, scrollY: y } = window;
  d.showModal();
  if (window.scrollY !== y || window.scrollX !== x) window.scrollTo(x, y);
}
