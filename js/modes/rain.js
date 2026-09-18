/* ------------------------------------------------------------------
   modes/rain.js
   "RAIN" (symbols/3.svg) — while active, clicking a photo makes that
   one photo fall out of the archive instead of opening it. Only
   clicked photos fall; nothing happens on its own. Falling never
   touches the underlying image data, only the DOM: a fallen card is
   simply removed, and switching away from this mode (any other symbol,
   or clicking this one again) rebuilds the whole canvas fresh via
   ModeManager's resetView(), exactly like every other mode — so
   nothing about a rained-out photo is ever permanent.

   How it works:
     - Same technique PLAY WITH THE RULES uses to swallow the click a
       drag would otherwise also fire: one delegated, capture-phase
       click listener on the canvas intercepts the click before it
       reaches the card's own bubble-phase "click -> openIsolation"
       listener (added once, in app.js's makeCard) and stops it there,
       so isolation never opens while this mode is on.
     - The card then gets a one-off fall: pointer-events are turned off
       (so it can't be clicked again mid-fall or block whatever's
       underneath), and a transform/transition pair, sized off the
       card's own already-known position (the inline left/top/width the
       layout wrote — see placeImage() in app.js), carries it down past
       the bottom of the current viewport before ctx.timeout removes it.
     - Removing one absolutely-positioned card never reflows any other
       card (each one is placed independently) and never shrinks the
       scrollable canvas height, since that height was already fixed by
       the layout at the moment the card was placed, not by which cards
       still happen to be in the DOM.
------------------------------------------------------------------- */
(function () {
  function triggerFall(ctx, card) {
    if (card.dataset.falling === "1") return; // already on its way down
    card.dataset.falling = "1";
    card.classList.add("falling");

    const canvasWrap = ctx.archive.getCanvasWrapEl();
    const top = parseFloat(card.style.top) || 0;
    const frame = card.querySelector(".photo-frame");
    const height = frame ? (parseFloat(frame.style.height) || 0) : 0;
    const viewportBottom = canvasWrap.scrollTop + canvasWrap.clientHeight;
    const distance = Math.max(240, viewportBottom - top + height + 200); // clears the bottom of the current view with room to spare

    const duration = 900 + Math.random() * 500; // ms, within the "falls, then disappears" feel
    const drift = (Math.random() * 2 - 1) * 40; // px of sideways wander as it falls
    const rotation = (Math.random() * 16 - 8).toFixed(1); // a very slight tumble, not a full spin

    card.style.zIndex = 998;
    card.style.transition = `transform ${duration}ms cubic-bezier(0.55, 0, 1, 0.45)`; // ease-in, gravity-like acceleration
    requestAnimationFrame(() => {
      card.style.transform = `translate(${drift.toFixed(1)}px, ${distance.toFixed(1)}px) rotate(${rotation}deg)`;
    });

    ctx.timeout(() => card.remove(), duration + 60);
  }

  ModeManager.register("rain", {
    label: "RAIN",

    enter(ctx) {
      const canvasEl = ctx.archive.getCanvasEl();
      ctx.on(canvasEl, "click", (e) => {
        const card = e.target.closest(".photo-card");
        if (!card) return;
        e.stopPropagation();
        e.preventDefault();
        triggerFall(ctx, card);
      }, true);
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: any pending fall-removal
      // timeouts are cancelled, and ModeManager's follow-up
      // archive.resetView() rebuilds every card fresh from the
      // permanent data right after, which is also what un-does any
      // fall still mid-flight.
    },
  });
})();
