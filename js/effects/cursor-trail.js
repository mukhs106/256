/* ------------------------------------------------------------------
   effects/cursor-trail.js
   symbols/2.svg — an instant trigger, not a mode: clicking it turns on
   a soft particle trail that follows the pointer for about 8 seconds,
   then stops on its own. See js/modes-config.js (SYMBOL_FX_CONFIG) for
   how a symbol gets wired to this.

   All state (whether the trail is running, the pointermove listener,
   the auto-stop timer) lives in this file's own closure rather than on
   ArchiveAPI/ModeManager, since the trail never touches the archive —
   dots are appended straight to <body> as fixed-position elements.
   Re-triggering always calls stop() first, so clicking the symbol
   again while a trail is already running restarts cleanly instead of
   layering a second pointermove listener on top of the first.
------------------------------------------------------------------- */
(function () {
  const DURATION_MS = 8000; // how long the trail stays live after a trigger
  const SPAWN_INTERVAL_MS = 24; // throttles particle creation on fast/continuous pointermove
  const PARTICLE_LIFETIME_MS = 750; // matches cursorTrailFade's animation-duration in style.css, plus a small buffer

  let active = false;
  let lastSpawn = 0;
  let stopTimer = null;

  function spawnParticle(x, y) {
    const el = document.createElement("div");
    el.className = "cursor-trail-dot";
    const size = 5 + Math.random() * 7;
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.left = (x - size / 2) + "px";
    el.style.top = (y - size / 2) + "px";
    el.style.opacity = (0.35 + Math.random() * 0.4).toFixed(2);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), PARTICLE_LIFETIME_MS);
  }

  function onPointerMove(e) {
    const now = performance.now();
    if (now - lastSpawn < SPAWN_INTERVAL_MS) return;
    lastSpawn = now;
    spawnParticle(e.clientX, e.clientY);
  }

  function stop() {
    if (!active) return;
    active = false;
    document.removeEventListener("pointermove", onPointerMove);
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  }

  function triggerCursorTrail() {
    stop();
    active = true;
    lastSpawn = 0;
    document.addEventListener("pointermove", onPointerMove);
    stopTimer = setTimeout(stop, DURATION_MS);
  }

  window.SymbolFX = window.SymbolFX || {};
  window.SymbolFX.cursorTrail = triggerCursorTrail;
})();
