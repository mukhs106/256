/* ------------------------------------------------------------------
   modes/magnet.js
   "MAGNET" (symbols/5.svg) — hovering a photo makes it the field's
   center right away, no click needed: it stays exactly where it is
   (never dragged, never pulled itself), while every OTHER card within
   range immediately starts easing toward it, pulled harder the closer
   it already is — a field radiating from whichever photo the pointer
   is currently over, not a cursor-follow effect. Moving the pointer to
   a different photo simply moves the center there; moving off every
   photo turns the field off. Pressing and holding down on the hovered
   photo instantly amplifies the field to a much stronger, much
   wider-reaching state for as long as it's held — no ramp-up, the jump
   happens on the very next frame — and it drops back to the ambient
   hover strength the instant it's released.

   Clicking is only ever a side effect of hovering + pressing here
   (never a deliberate "select" gesture the way it used to be), so a
   click never opens isolation while this mode is active — the
   capture-phase listener below unconditionally swallows it, same
   technique DUPLICATES uses to repurpose a click for its own
   mode-specific gesture; nothing about scrolling or the cards
   themselves changes.

   All the field's own math is card-to-card (the center card's home
   position vs. every other card's home position, both already in the
   same canvas-local coordinate space via their inline left/top) — the
   only thing actually tracked from the pointer is which single card
   (if any) it's currently over, and whether a button is currently
   held down.

   Performance: the card list is only re-queried periodically via
   ctx.interval (also where stale offset state is pruned), not every
   frame, and the base .photo-card transition is turned off for the
   duration (see body[data-mode="magnet"] in style.css) so this mode's
   own per-frame easing is the only thing smoothing the motion.
------------------------------------------------------------------- */
(function () {
  const RADIUS = 620; // px — how far from the hovered card the field reaches at rest
  const MAX_PULL = 95; // px — the strongest pull (right next to the center) at rest
  const RADIUS_PRESSED = 950; // px — the field's reach while the center is actively held down
  const MAX_PULL_PRESSED = 240; // px — the strongest pull while actively held down
  const EASE = 0.14; // fraction of the remaining gap an offset closes per frame
  const CARD_RESCAN_MS = 500; // how often the live card list is refreshed (pan/zoom loads and drops chunks)

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
      const offsets = new Map(); // card el -> current eased {x, y}, only kept while live/non-zero
      let hoverCard = null; // the single card currently under the pointer — the field's center, or null when off every card
      let pressed = false; // a pointer button is currently held down somewhere over the canvas

      ctx.interval(() => {
        cards = ctx.archive.getCards();
        const live = new Set(cards);
        for (const key of offsets.keys()) {
          if (!live.has(key)) offsets.delete(key); // card's chunk was dropped — drop its offset state too
        }
        if (hoverCard && !live.has(hoverCard)) {
          hoverCard.classList.remove("magnet-center");
          hoverCard = null; // the field's center scrolled out and was dropped — turn the field off rather than pull toward a ghost
        }
      }, CARD_RESCAN_MS);

      function setHover(card) {
        if (card === hoverCard) return;
        if (hoverCard) hoverCard.classList.remove("magnet-center");
        hoverCard = card;
        if (hoverCard) {
          hoverCard.classList.add("magnet-center");
          offsets.delete(hoverCard); // the center itself never carries a pull offset
        }
      }

      ctx.on(canvasWrap, "pointermove", (e) => {
        setHover(e.target.closest(".photo-card"));
      });
      ctx.on(canvasWrap, "pointerleave", () => setHover(null));

      ctx.on(canvasEl, "pointerdown", () => { pressed = true; });
      function release() { pressed = false; }
      ctx.on(canvasEl, "pointerup", release);
      ctx.on(canvasEl, "pointercancel", release);

      // Hovering/pressing is how the field gets aimed here, so a click
      // never opens isolation while this mode is active.
      ctx.on(canvasEl, "click", (e) => {
        if (!e.target.closest(".photo-card")) return;
        e.stopPropagation();
        e.preventDefault();
      }, true);

      ctx.loop(() => {
        const center = hoverCard ? cardCenter(hoverCard) : null;

        // No ramp-up: holding down on the center amplifies the field
        // to its stronger, wider-reaching state on the very next
        // frame, and it drops back just as instantly on release — only
        // each individual card's own eased approach (below) is what
        // keeps the motion smooth.
        const boosted = pressed && hoverCard;
        const radius = boosted ? RADIUS_PRESSED : RADIUS;
        const maxPull = boosted ? MAX_PULL_PRESSED : MAX_PULL;

        cards.forEach((card) => {
          if (card === hoverCard) return; // the center holds still — never eased, never offset

          let targetX = 0, targetY = 0;
          if (center) {
            const c = cardCenter(card);
            const dx = center.x - c.x;
            const dy = center.y - c.y;
            const dist = Math.hypot(dx, dy);
            if (dist < radius && dist > 0.01) {
              // Closer cards feel a stronger pull — the field radiates
              // outward from the center rather than applying evenly.
              const strength = (1 - dist / radius) * maxPull;
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
      // Nothing beyond ctx's own auto-cleanup: it cancels the rAF loop,
      // the rescan interval, and the pointer/click listeners;
      // archive.resetView()'s follow-up rebuild is what actually clears
      // any transform (and the "magnet-center" class) this mode was
      // still easing.
    },
  });
})();
