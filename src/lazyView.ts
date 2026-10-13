import { lazy, type ComponentType } from "react";

/**
 * A view that loads the first time its tab is opened. If its file will not load (the site was updated while the page was open and the old
 * file is gone, or the connection dropped), it is tried once more, then the page reloads once to pick up the new version; only if that
 * also fails does the error reach the view's message.
 */
export function lazyView<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, name: string) {
  const attempt = () =>
    load()
      .catch(() => new Promise((r) => setTimeout(r, 700)).then(load))
      .catch((err) => {
        try {
          const key = `fbwatch-view-reload-${name}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            sessionStorage.setItem("fbwatch-resume", "1"); // the page comes back on the tab that was being opened
            location.reload();
            return new Promise<never>(() => {});
          }
        } catch {
          /* storage blocked: fall through to the message */
        }
        throw err;
      });
  return lazy(attempt);
}
