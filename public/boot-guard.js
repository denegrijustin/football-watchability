// If the board's code or data never arrives (a stale page after a deploy, a dropped connection, a data file that failed), the grey loading bars
// would stay forever. This reloads once on its own and, if that does not help, says so and offers a button. It is a separate file because the
// site's content security policy allows scripts only from its own address.
(function () {
  var KEY = "fbwatch-boot-retry";
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
      "<p>" + text + '</p><button type="button" style="min-height:44px;padding:0 22px;border-radius:10px;border:1px solid #3a4b57;background:#1d2a35;color:#eaf0f4;font:inherit;cursor:pointer">Reload</button></div>';
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
