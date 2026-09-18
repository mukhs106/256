/* ------------------------------------------------------------------
   effects/cursor-trail.js
   symbols/2.svg — an instant trigger, not a mode: clicking it turns on
   a soft particle trail that follows the pointer for about 8 seconds,
   then stops on its own. See js/modes-config.js (SYMBOL_FX_CONFIG) for
   how a symbol gets wired to this.

   Two things keep the trail feeling attached to the cursor rather than
   like a loose string of dots behind it:
     - Activation itself spawns a small immediate burst right at the
       triggering click, so pressing the symbol is its own visible
       result rather than something that only shows up once the mouse
       happens to move.
     - Particles are spaced by DISTANCE travelled, not just time: a
       fast flick of the mouse would otherwise only get one dot per
       pointermove event, leaving visible gaps — instead, a big jump
       between two events gets filled with evenly spaced dots along
       that segment (capped, so a huge jump like the cursor re-entering
       the window can't spawn an unbounded burst).

   All state (whether the trail is running, the pointermove listener,
   the auto-stop timer, the last spawn point) lives in this file's own
   closure rather than on ArchiveAPI/ModeManager, since the trail never
   touches the archive — dots are appended straight to <body> as fixed-
   position elements. Re-triggering always calls stop() first, so
   clicking the symbol again while a trail is already running restarts
   cleanly instead of layering a second pointermove listener on top of
   the first.
------------------------------------------------------------------- */
(function () {
  const DURATION_MS = 8000; // how long the trail stays live after a trigger
  const SPACING_PX = 14; // target distance between consecutively spawned dots along the path
  const MAX_STEPS_PER_EVENT = 8; // caps interpolation on a very large jump between two pointermove events
  const PARTICLE_LIFETIME_MS = 750; // matches cursorTrailFade's animation-duration in style.css, plus a small buffer
  const BURST_COUNT = 7; // dots spawned immediately at activation, around the triggering click

  let active = false;
  let lastX = null, lastY = null;
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

  function spawnBurst(x, y) {
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 16;
      spawnParticle(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
  }

  function onPointerMove(e) {
    if (lastX === null) {
      lastX = e.clientX; lastY = e.clientY;
      spawnParticle(e.clientX, e.clientY);
      return;
    }

    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    const dist = Math.hypot(dx, dy);
    if (dist < SPACING_PX) return;

    const steps = Math.min(MAX_STEPS_PER_EVENT, Math.floor(dist / SPACING_PX));
    for (let i = 1; i <= steps; i++) {
      spawnParticle(lastX + (dx * i) / steps, lastY + (dy * i) / steps);
    }
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function stop() {
    if (!active) return;
    active = false;
    document.removeEventListener("pointermove", onPointerMove);
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    lastX = lastY = null;
  }

  // `e`, when given, is the click/keydown event that triggered this —
  // used only to place the activation burst; a keyboard activation
  // (no clientX/Y) just skips the burst and starts from the first
  // pointermove instead.
  function triggerCursorTrail(archive, e) {
    stop();
    active = true;
    if (e && typeof e.clientX === "number" && typeof e.clientY === "number") {
      spawnBurst(e.clientX, e.clientY);
      lastX = e.clientX;
      lastY = e.clientY;
    }
    document.addEventListener("pointermove", onPointerMove);
    stopTimer = setTimeout(stop, DURATION_MS);
  }

  window.SymbolFX = window.SymbolFX || {};
  window.SymbolFX.cursorTrail = triggerCursorTrail;
})();
