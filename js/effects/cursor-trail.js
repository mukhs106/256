/* ------------------------------------------------------------------
   effects/cursor-trail.js
   symbols/2.svg — an instant trigger, not a mode: clicking it releases
   small copies of the page's own nav symbols (symbols/1.svg..6.svg)
   around the pointer for about 8 seconds, then stops spawning new ones
   on its own. See js/modes-config.js (SYMBOL_FX_CONFIG) for how a
   symbol gets wired to this.

   Pieces are sprinkled around the cursor rather than spawned exactly
   on it, and fall mostly straight down (a small, mostly-cosmetic
   sideways drift, dominated by a larger downward one) rather than
   flying outward in every direction — meant to read as symbols being
   released into the page, not an explosion centered on the pointer.

   A minority of pieces (STICK_CHANCE) fall a short distance and settle
   at low opacity instead of fading all the way out, staying in the DOM
   as a faint trace — visible evidence the interaction passed through
   that part of the page. STUCK_CAP bounds how many of those can exist
   at once (oldest is evicted first) so a long session can't quietly
   grow the DOM without limit; every piece — stuck or not — is on its
   own timer regardless, so nothing here needs the trail to still be
   "active" to eventually clean itself up.

   Kept deliberately light for performance: pieces are small <img>s
   referencing the same tiny SVG files already used in the header nav
   (so they're already warm in the browser's cache after first paint),
   animated with CSS transform/opacity (compositor-friendly, no
   per-frame JS), spawned by distance rather than by every pointermove
   event, and capped both per burst and for how many can be "stuck" at
   once.

   All state (whether the trail is running, the pointermove listener,
   the auto-stop timer, the last spawn point, the stuck-piece queue)
   lives in this file's own closure rather than on ArchiveAPI/
   ModeManager, since the trail never touches the archive — pieces are
   appended straight to <body> as fixed-position elements. Re-triggering
   always calls stop() first, so clicking the symbol again while a
   trail is already running restarts spawning cleanly instead of
   layering a second pointermove listener on top of the first (already-
   stuck pieces are left alone either way, since they're not part of
   what stop() tears down).
------------------------------------------------------------------- */
(function () {
  const SYMBOL_COUNT = 6; // symbols/1.svg..6.svg
  const DURATION_MS = 8000; // how long new pieces keep spawning after a trigger
  const SPACING_PX = 46; // target distance between consecutively spawned pieces along the path — sparser than a dot trail, for a "light sprinkle" and lighter DOM churn
  const MAX_STEPS_PER_EVENT = 3; // caps interpolation on a very large jump between two pointermove events
  const BURST_COUNT = 5; // pieces spawned immediately around the triggering click

  const SIZE_PX = [13, 20]; // px, per-piece size — small, per the design ask
  const SIDEWAYS_PX = [10, 26]; // px, small horizontal drift while falling (signed)
  const ROT_DEG = [20, 50]; // deg, gentle tumble while falling (signed)

  const FALL_DIST_PX = [70, 150]; // px, how far a normal (non-sticking) piece falls before it's gone
  const FALL_LIFETIME_MS = [1100, 1700];

  const STICK_CHANCE = 0.25; // fraction of pieces that settle as a trace instead of fading all the way out
  const STICK_DIST_PX = [26, 60]; // px — a shorter fall before a sticking piece settles
  const STICK_SETTLE_MS = [550, 850]; // how long the settle-into-place animation takes
  const STICK_LIFETIME_MS = [12000, 18000]; // a stuck piece still eventually cleans itself up
  const STUCK_CAP = 30; // bounds how many stuck traces can exist at once (oldest evicted first)

  let active = false;
  let lastX = null, lastY = null;
  let stopTimer = null;
  const stuck = []; // FIFO of { el, timer }

  function rand([lo, hi]) { return lo + Math.random() * (hi - lo); }
  function signed(range) { return (Math.random() < 0.5 ? -1 : 1) * rand(range); }

  function evictOldestStuck() {
    const entry = stuck.shift();
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.el.remove();
  }

  function spawnPiece(x, y) {
    const el = document.createElement("img");
    el.src = "symbols/" + (1 + Math.floor(Math.random() * SYMBOL_COUNT)) + ".svg";
    el.alt = "";
    el.className = "symbol-trail-piece";

    const size = rand(SIZE_PX);
    el.style.width = size + "px";
    el.style.height = size + "px";

    // Sprinkled around the point rather than spawned exactly on it.
    const jx = (Math.random() * 2 - 1) * 10;
    const jy = (Math.random() * 2 - 1) * 6;
    el.style.left = (x + jx - size / 2) + "px";
    el.style.top = (y + jy - size / 2) + "px";

    const dx = signed(SIDEWAYS_PX);
    const rot = signed(ROT_DEG);
    el.style.setProperty("--fall-dx", dx.toFixed(1) + "px");
    el.style.setProperty("--fall-rot", rot.toFixed(1) + "deg");

    if (stuck.length < STUCK_CAP && Math.random() < STICK_CHANCE) {
      const dy = rand(STICK_DIST_PX);
      el.style.setProperty("--fall-dy", dy.toFixed(1) + "px");
      el.style.animationDuration = Math.round(rand(STICK_SETTLE_MS)) + "ms";
      el.classList.add("symbol-trail-stick");
      document.body.appendChild(el);

      if (stuck.length >= STUCK_CAP) evictOldestStuck();
      const entry = { el, timer: null };
      entry.timer = setTimeout(() => {
        const i = stuck.indexOf(entry);
        if (i !== -1) stuck.splice(i, 1);
        entry.el.remove();
      }, rand(STICK_LIFETIME_MS));
      stuck.push(entry);
    } else {
      const dy = rand(FALL_DIST_PX);
      el.style.setProperty("--fall-dy", dy.toFixed(1) + "px");
      const life = rand(FALL_LIFETIME_MS);
      el.style.animationDuration = Math.round(life) + "ms";
      el.classList.add("symbol-trail-fall");
      document.body.appendChild(el);
      setTimeout(() => el.remove(), life + 60);
    }
  }

  function spawnBurst(x, y) {
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 14;
      spawnPiece(x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.5); // flattened — a sprinkle around the point, not a full radial burst
    }
  }

  function onPointerMove(e) {
    if (lastX === null) {
      lastX = e.clientX; lastY = e.clientY;
      spawnPiece(e.clientX, e.clientY);
      return;
    }

    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    const dist = Math.hypot(dx, dy);
    if (dist < SPACING_PX) return;

    const steps = Math.min(MAX_STEPS_PER_EVENT, Math.floor(dist / SPACING_PX));
    for (let i = 1; i <= steps; i++) {
      spawnPiece(lastX + (dx * i) / steps, lastY + (dy * i) / steps);
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
