/* ------------------------------------------------------------------
   modes/cursor-trail.js
   "CURSOR TRAIL" (symbols/2.svg) — releases small copies of the page's
   own nav symbols (symbols/1.svg..6.svg) around the pointer for as
   long as this symbol stays selected. Registered as a persistent mode
   (rather than the fixed-duration one-shot effect this used to be) so
   it never stops itself on a timer — only switching to a different
   symbol/mode, or a page reset, turns it off, exactly like RAIN/
   DUPLICATES/MAGNET/DRIFT already behave. See js/modes-config.js
   (MODE_CONFIG) for how a symbol gets wired to this.

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
   own timer regardless, so nothing here needs the mode to still be
   active for a piece to eventually clean itself up. `stuck` and the
   spawn helpers live in this file's own outer closure (not inside
   enter()) so that cap keeps counting correctly across turning the
   mode off and back on, the same as it did across repeated triggers
   of the old one-shot effect.

   Kept deliberately light for performance: pieces are small <img>s
   referencing the same tiny SVG files already used in the header nav
   (so they're already warm in the browser's cache after first paint),
   animated with CSS transform/opacity (compositor-friendly, no
   per-frame JS), spawned by distance rather than by every pointermove
   event, and capped both per burst and for how many can be "stuck" at
   once.

   Unlike the old effect, entering a mode doesn't hand this the
   triggering click's coordinates, so there's no activation burst at
   the click point anymore — the trail simply starts from the first
   pointermove after the symbol is selected, the same fallback the
   previous version already used for a keyboard-triggered activation.
------------------------------------------------------------------- */
(function () {
  const SYMBOL_COUNT = 6; // symbols/1.svg..6.svg
  const SPACING_PX = 46; // target distance between consecutively spawned pieces along the path — sparser than a dot trail, for a "light sprinkle" and lighter DOM churn
  const MAX_STEPS_PER_EVENT = 3; // caps interpolation on a very large jump between two pointermove events

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

  let lastX = null, lastY = null;
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

  ModeManager.register("cursorTrail", {
    label: "CURSOR TRAIL",

    enter(ctx) {
      lastX = lastY = null; // first pointermove after selecting the symbol spawns immediately, same as a keyboard-triggered activation used to
      ctx.on(document, "pointermove", onPointerMove);
    },

    exit(ctx) {
      // ctx's own auto-cleanup removes the pointermove listener above.
      // Pieces already falling or stuck are left exactly alone — each
      // is on its own independent timer (see the file-header note) —
      // so switching away doesn't yank a trace off the page mid-fade.
    },
  });
})();
