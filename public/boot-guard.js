// If the board's code or data never arrives (a stale page after a deploy, a dropped connection, a data file that failed), the grey loading bars
// would stay forever. This reloads once on its own and, if that does not help, says so and offers a button. It is a separate file because the
// site's content security policy allows scripts only from its own address.
(function () {
  var KEY = "fbwatch-boot-retry";
  // What went wrong, kept so the message can say (and a screenshot of it tells whoever is fixing it what to look for).
  var why = "";
  function note(m) { if (!why && m) why = String(m).slice(0, 220); }
  window.addEventListener("error", function (e) { note(e && (e.message || (e.target && e.target.src && "could not load " + e.target.src))); }, true);
  window.addEventListener("unhandledrejection", function (e) { note(e && e.reason && (e.reason.message || e.reason)); });
  var root = function () { return document.getElementById("root"); };
  var stuck = function () { var r = root(); return !!(r && r.querySelector(".boot")); };
  function reloadOnce() {
    try {
      if (sessionStorage.getItem(KEY)) return false;
      sessionStorage.setItem(KEY, "1");
    } catch (e) {
      return false;
    }
    location.reload();
    return true;
  }
  function say(text) {
    var r = root();
    if (!r || !stuck()) return;
    r.innerHTML = '<div class="boot-fail" role="alert" style="max-width:520px;margin:48px auto;padding:0 16px;color:#eaf0f4;font:16px/1.5 system-ui,sans-serif;text-align:center">' +
      "<p>" + text + "</p>" + (why ? '<p style="font-size:12px;opacity:.7;word-break:break-word">' + why.replace(/[<>&]/g, "") + "</p>" : "") + '<button type="button" style="min-height:44px;padding:0 22px;border-radius:10px;border:1px solid #3a4b57;background:#1d2a35;color:#eaf0f4;font:inherit;cursor:pointer">Reload</button></div>';
    r.querySelector("button").onclick = function () {
      try { sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ }
      location.reload();
    };
  }
  var entry = document.querySelector('script[type="module"]');
  if (entry) entry.addEventListener("error", function () { if (!reloadOnce()) say("The board's code did not load. Check your connection and reload."); });
  // The board replaces the loading bars within moments; forgive the slow connection for a while, then act.
  setTimeout(function () { if (stuck() && !reloadOnce()) say("The board is taking too long to load."); }, 12000);
  // Once it is up, a later trouble may reload again.
  var timer = setInterval(function () {
    if (!stuck()) {
      clearInterval(timer);
      try { sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ }
    }
  }, 1000);
})();
