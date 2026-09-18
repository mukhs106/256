/* ------------------------------------------------------------------
   modes/duplicates.js
   "DUPLICATES" (symbols/4.svg) — while active, clicking a photo (or
   one of its own copies) spawns a visual duplicate of that image, near
   its source, gently offset so a cluster stays legible rather than
   stacking pixel-for-pixel. Capped per original image so nothing grows
   without bound.

   How it works:
     - Same technique RAIN uses to take over what a click on a photo
       does: one delegated, capture-phase click listener on the canvas,
       so it runs before the card's own bubble-phase "click ->
       openIsolation" listener and can stop it there.
     - A duplicate is a cloneNode(true) of whichever card was clicked
       (the original or an existing duplicate), repositioned at a
       guaranteed minimum radial distance (a random angle + a random
       distance within [MIN_DIST, MAX_DIST], never an independent
       per-axis offset that can cancel out near zero) from its source's
       own inline left/top — the same positioning system placeImage()
       in app.js already writes, so no separate layout math is needed.
       The reverse of that same vector drives the CSS "jump" animation
       below (see --dup-dx/--dup-dy), so the pop always travels FROM the
       source's position TO wherever the duplicate actually lands.
     - Every duplicate is tagged data-duplicate-origin with the id of
       the ORIGINAL archive image it traces back to (never a duplicate's
       own transient identity, and its own data-id is stripped so nei-
       ther it nor archive.getCards()/cardFor() ever mistake it for a
       real card) — that id is what MAX_PER_ORIGIN is counted against,
       so a whole cluster grown from one photo still shares one cap.
     - Every duplicate is added via ctx.addTempNode, so simply leaving
       this mode (any other symbol, or clicking this one again) removes
       all of them in one pass, before archive.resetView() rebuilds the
       real cards fresh — nothing about a duplicate ever touches the
       archive's own image data or the layout's column bookkeeping.
     - Each new duplicate also renders slightly larger than the last,
       via GROWTH_PER_DUP below — sized off the true original's own
       (unscaled) width/height via archive.cardFor(originId), never off
       whichever copy was actually clicked, so the growth stays a
       steady, predictable step per duplicate regardless of click order
       instead of compounding when someone clicks an already-enlarged
       copy.
------------------------------------------------------------------- */
(function () {
  const MAX_PER_ORIGIN = 20;
  const DIST_MIN = 34; // px, guaranteed minimum jump distance — never lands almost on top of its source
  const DIST_MAX_EARLY = 64; // px, upper end of the jump distance for the earliest duplicates
  const DIST_MAX_LATE = 90; // px, upper end once a cluster has grown — spreads out further, but still controlled
  const ROTATION_MAX = 10; // deg, grows alongside the offset for the same "increasingly playful" reason
  const BASE_GROWTH = 1.15; // even the very first duplicate renders ~15% larger than the original
  const GROWTH_PER_DUP = 0.08; // each further duplicate adds another ~8% on top of BASE_GROWTH
  const MAX_GROWTH = 2.2; // hard cap on that growth — visibly larger over a long cluster, never "giant"

  // A duplicate always points back to the original photo it traces to,
  // never to whichever copy happened to get clicked.
  function originIdFor(el) {
    return el.dataset.duplicateOrigin || el.dataset.id;
  }

  ModeManager.register("duplicates", {
    label: "DUPLICATES",

    enter(ctx) {
      const canvasEl = ctx.archive.getCanvasEl();
      const counts = new Map(); // originId -> duplicates spawned so far
      let zCounter = 500; // each new duplicate lands above every earlier one

      ctx.on(canvasEl, "click", (e) => {
        const source = e.target.closest(".photo-card");
        if (!source) return;
        e.stopPropagation();
        e.preventDefault();

        const originId = originIdFor(source);
        if (!originId) return;
        const count = counts.get(originId) || 0;
        if (count >= MAX_PER_ORIGIN) return;

        const left = parseFloat(source.style.left) || 0;
        const top = parseFloat(source.style.top) || 0;

        // A cluster spreads and tilts a little further with every added
        // copy, so repeated clicking visibly builds toward something
        // messier rather than always landing the same modest jump.
        const grown = count / MAX_PER_ORIGIN;
        const distMax = DIST_MAX_EARLY + (DIST_MAX_LATE - DIST_MAX_EARLY) * grown;
        const rotation = (Math.random() * 2 - 1) * ROTATION_MAX * (0.3 + 0.7 * grown);

        // Polar, not independent per-axis, offsets — a guaranteed minimum
        // radial distance in a random direction, so a duplicate always
        // visibly jumps clear of its source instead of sometimes landing
        // with both axes near zero (almost on top of it).
        const angle = Math.random() * Math.PI * 2;
        const dist = DIST_MIN + Math.random() * (distMax - DIST_MIN);
        const offsetX = Math.cos(angle) * dist;
        const offsetY = Math.sin(angle) * dist;

        // Sized off the true original's own base width/height, not the
        // clicked source's (which may itself already be an enlarged
        // duplicate) — see the file-header note above.
        const original = ctx.archive.cardFor(originId);
        const baseFrame = original && original.querySelector(".photo-frame");
        const baseWidth = original ? (parseFloat(original.style.width) || 0) : 0;
        const baseHeight = baseFrame ? (parseFloat(baseFrame.style.height) || 0) : 0;
        const scale = Math.min(MAX_GROWTH, BASE_GROWTH + count * GROWTH_PER_DUP);

        const clone = source.cloneNode(true);
        clone.classList.add("duplicate-card");
        delete clone.dataset.id;
        clone.dataset.duplicateOrigin = originId;
        clone.style.left = (left + offsetX) + "px";
        clone.style.top = (top + offsetY) + "px";
        clone.style.zIndex = String(zCounter++);
        clone.style.setProperty("--duplicate-rot", rotation.toFixed(1) + "deg");
        // The jump animation (see duplicatePop in style.css) starts the
        // duplicate back at its source's position and travels the reverse
        // of this same offset, so it always reads as leaping FROM the
        // original TO its landing spot rather than just popping in place.
        clone.style.setProperty("--dup-dx", (-offsetX).toFixed(1) + "px");
        clone.style.setProperty("--dup-dy", (-offsetY).toFixed(1) + "px");
        if (baseWidth && baseHeight) {
          clone.style.width = (baseWidth * scale).toFixed(1) + "px";
          const cloneFrame = clone.querySelector(".photo-frame");
          if (cloneFrame) cloneFrame.style.height = (baseHeight * scale).toFixed(1) + "px";
        }

        ctx.addTempNode(clone, canvasEl);
        counts.set(originId, count + 1);
      }, true);
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: it removes every
      // duplicate node added via ctx.addTempNode above, and
      // archive.resetView()'s follow-up rebuild restores the real
      // cards exactly as the permanent data describes them.
    },
  });
})();
