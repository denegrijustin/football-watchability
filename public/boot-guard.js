// The first thing on the page, before the app's code. It never reloads the page by itself: a slow connection is not a broken page.
//  - If the app's script fails to load at all, it says so and offers a Reload button.
//  - If nothing has started after a long wait (the script is still on its way), it says the connection is slow, still without acting.
// Once the app starts it reports its own state on <html data-fb-boot> (loading, ready, degraded, failed) and draws its own messages.
// This is a separate file because the site's content security policy allows scripts only from its own address.
(function () {
  var why = "";
  function note(m) { if (!why && m) why = String(m).slice(0, 200); }
  window.addEventListener("error", function (e) { note(e && (e.message || (e.target && e.target.src && "could not load " + e.target.src))); }, true);
  window.addEventListener("unhandledrejection", function (e) { note(e && e.reason && (e.reason.message || e.reason)); });
  var root = function () { return document.getElementById("root"); };
  var started = function () { return !!document.documentElement.getAttribute("data-fb-boot"); };
  var waiting = function () { var r = root(); return !!(r && r.querySelector(".boot")); };
  function el(tag, text, css) {
    var n = document.createElement(tag);
    if (text) n.textContent = text;
    if (css) n.style.cssText = css;
    return n;
  }
  // Safe by construction: every message goes in as text, never as markup.
  function show(message, withReload) {
    var r = root();
    if (!r || !waiting()) return;
    var box = el("div", "", "max-width:520px;margin:48px auto;padding:0 16px;color:#eaf0f4;font:16px/1.5 system-ui,sans-serif;text-align:center");
    box.className = "boot-fail";
    box.setAttribute("role", withReload ? "alert" : "status");
    box.appendChild(el("p", message));
    if (why) box.appendChild(el("p", why, "font-size:12px;opacity:.7;word-break:break-word"));
    if (withReload) {
      var b = el("button", "Reload the page", "min-height:44px;padding:0 22px;border-radius:10px;border:1px solid #3a4b57;background:#1d2a35;color:#eaf0f4;font:inherit;cursor:pointer");
      b.type = "button";
      b.onclick = function () { location.reload(); };
      box.appendChild(b);
    }
    r.textContent = "";
    r.appendChild(box);
  }
  var entry = document.querySelector('script[type="module"]');
  if (entry) entry.addEventListener("error", function () { show("The site's code did not load. Check your connection, then reload the page.", true); });
  // Still waiting for the app to start after this long: say it is slow, and leave the choice to the visitor.
  setTimeout(function () {
    if (!started() && waiting()) {
      var msg = document.querySelector(".boot-msg");
      if (msg) msg.textContent = "Still connecting. This is taking longer than usual.";
    }
  }, 12000);
})();
