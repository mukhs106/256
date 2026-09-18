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
       (the original or an existing duplicate), repositioned with a
       small random offset from its source's own inline left/top — the
       same positioning system placeImage() in app.js already writes,
       so no separate layout math is needed.
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
------------------------------------------------------------------- */
(function () {
  const MAX_PER_ORIGIN = 20;
  const OFFSET_MIN = 22; // px, how far the earliest duplicates land from their source
  const OFFSET_MAX = 52; // px, how far duplicates land once a cluster has grown — spreads out more as it builds up
  const ROTATION_MAX = 10; // deg, grows alongside the offset for the same "increasingly playful" reason

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
        // messier rather than always landing the same modest offset.
        const grown = count / MAX_PER_ORIGIN;
        const offsetRange = OFFSET_MIN + (OFFSET_MAX - OFFSET_MIN) * grown;
        const rotation = (Math.random() * 2 - 1) * ROTATION_MAX * (0.3 + 0.7 * grown);

        const clone = source.cloneNode(true);
        clone.classList.add("duplicate-card");
        delete clone.dataset.id;
        clone.dataset.duplicateOrigin = originId;
        clone.style.left = (left + (Math.random() * 2 - 1) * offsetRange) + "px";
        clone.style.top = (top + (Math.random() * 2 - 1) * offsetRange) + "px";
        clone.style.zIndex = String(zCounter++);
        clone.style.setProperty("--duplicate-rot", rotation.toFixed(1) + "deg");

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
