/* ------------------------------------------------------------------
   modes/magnet.js
   "MAGNET" (symbols/5.svg) — while active, photos within a radius of
   the pointer nudge gently toward it, stronger the closer the pointer
   gets, and ease back to their normal spot as it moves away or leaves.

   Never touches click handling (no listener added or intercepted, so
   clicking/isolation/scrolling all keep working exactly as they do in
   the plain archive) — this mode only ever writes a card's own
   `transform`, the same property placeImage() in app.js already sets
   it to `rotate(0)`, so there's nothing else to reconcile it with.

   Performance: the pointer position is only ever read from the last
   pointermove event (no per-frame DOM measurement of it), and the card
   list itself is only re-queried periodically via ctx.interval — the
   one thing that has to run every animation frame is the small per-
   card arithmetic below, not a DOM query.
------------------------------------------------------------------- */
(function () {
  const RADIUS = 220; // px — how far from the pointer a card starts feeling a pull
  const MAX_PULL = 26; // px — the strongest pull, right at the pointer
  const EASE = 0.12; // fraction of the remaining gap a card's eased offset closes per frame
  const CARD_RESCAN_MS = 500; // how often the live card list is refreshed (scroll extends/prunes it)

  function cardCenter(card) {
    const left = parseFloat(card.style.left) || 0;
    const top = parseFloat(card.style.top) || 0;
    const width = parseFloat(card.style.width) || 0;
    const frame = card.querySelector(".photo-frame");
    const height = frame ? (parseFloat(frame.style.height) || 0) : 0;
    return { x: left + width / 2, y: top + height / 2 };
  }

  ModeManager.register("magnet", {
    label: "MAGNET",

    enter(ctx) {
      const canvasEl = ctx.archive.getCanvasEl();
      const canvasWrap = ctx.archive.getCanvasWrapEl();

      let cards = ctx.archive.getCards();
      ctx.interval(() => { cards = ctx.archive.getCards(); }, CARD_RESCAN_MS);

      ctx.scratch.pointer = null; // canvas-local {x, y}, or null when the pointer isn't over the archive
      ctx.on(canvasWrap, "pointermove", (e) => {
        const rect = canvasEl.getBoundingClientRect();
        ctx.scratch.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      });
      ctx.on(canvasWrap, "pointerleave", () => { ctx.scratch.pointer = null; });

      const offsets = new Map(); // card el -> current eased {x, y}, only kept while non-zero

      ctx.loop(() => {
        const pointer = ctx.scratch.pointer;

        cards.forEach((card) => {
          const c = cardCenter(card);
          let targetX = 0, targetY = 0;

          if (pointer) {
            const dx = pointer.x - c.x;
            const dy = pointer.y - c.y;
            const dist = Math.hypot(dx, dy);
            if (dist < RADIUS && dist > 0.01) {
              const strength = (1 - dist / RADIUS) * MAX_PULL;
              targetX = (dx / dist) * strength;
              targetY = (dy / dist) * strength;
            }
          }

          let cur = offsets.get(card);
          if (!cur) {
            if (targetX === 0 && targetY === 0) return; // never pulled, nothing to ease
            cur = { x: 0, y: 0 };
            offsets.set(card, cur);
          }

          cur.x += (targetX - cur.x) * EASE;
          cur.y += (targetY - cur.y) * EASE;

          if (targetX === 0 && targetY === 0 && Math.abs(cur.x) < 0.05 && Math.abs(cur.y) < 0.05) {
            card.style.transform = "";
            offsets.delete(card);
          } else {
            card.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px)`;
          }
        });
      });
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: it cancels the rAF loop
      // and the rescan interval and removes the pointermove/pointerleave
      // listeners; archive.resetView()'s follow-up rebuild is what
      // actually clears any transform this mode was still easing.
    },
  });
})();
