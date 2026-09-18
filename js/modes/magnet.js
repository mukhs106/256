/* ------------------------------------------------------------------
   modes/magnet.js
   "MAGNET" (symbols/5.svg) — click a photo to make it the field's
   center: it stays exactly where it is (never dragged, never pulled
   itself), while every OTHER card within range eases toward it,
   pulled harder the closer it already is — a field radiating from the
   selected photo, not a cursor-follow effect. Clicking the same photo
   again turns the field off; clicking a different one moves the
   center there instead, which also releases whatever the previous
   center was pulling toward it — it becomes an ordinary pullable card
   again the very next frame, now judged against the new center.

   Clicking a card is how the field gets aimed, so a click never opens
   isolation while this mode is active — the capture-phase listener
   below intercepts it, same technique DUPLICATES uses to repurpose a
   click for its own mode-specific gesture; nothing about scrolling or
   the cards themselves changes.

   All the field's own math is card-to-card (the selected card's home
   position vs. every other card's home position, both already in the
   same canvas-local coordinate space via their inline left/top) — no
   cursor tracking or pointer coordinate conversion needed at all.

   Performance: the card list is only re-queried periodically via
   ctx.interval (also where stale offset state — and a center card
   that's since scrolled out and been dropped — is pruned), not every
   frame, and the base .photo-card transition is turned off for the
   duration (see body[data-mode="magnet"] in style.css) so this mode's
   own per-frame easing is the only thing smoothing the motion.
------------------------------------------------------------------- */
(function () {
  const RADIUS = 360; // px — how far from the center card the field reaches
  const MAX_PULL = 75; // px — the strongest pull, for a card right next to the center
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

      let cards = ctx.archive.getCards();
      const offsets = new Map(); // card el -> current eased {x, y}, only kept while live/non-zero
      let centerCard = null;

      ctx.interval(() => {
        cards = ctx.archive.getCards();
        const live = new Set(cards);
        for (const key of offsets.keys()) {
          if (!live.has(key)) offsets.delete(key); // card's chunk was dropped — drop its offset state too
        }
        if (centerCard && !live.has(centerCard)) {
          centerCard.classList.remove("magnet-center");
          centerCard = null; // the field's center scrolled out and was dropped — turn the field off rather than pull toward a ghost
        }
      }, CARD_RESCAN_MS);

      function setCenter(card) {
        if (centerCard) centerCard.classList.remove("magnet-center");
        centerCard = card;
        if (centerCard) {
          centerCard.classList.add("magnet-center");
          offsets.delete(centerCard); // the center itself never carries a pull offset
        }
      }

      ctx.on(canvasEl, "click", (e) => {
        const card = e.target.closest(".photo-card");
        if (!card) return; // clicking open space doesn't touch the field
        e.stopPropagation();
        e.preventDefault();
        setCenter(card === centerCard ? null : card);
      }, true);

      ctx.loop(() => {
        const center = centerCard ? cardCenter(centerCard) : null;

        cards.forEach((card) => {
          if (card === centerCard) return; // the center holds still — never eased, never offset

          let targetX = 0, targetY = 0;
          if (center) {
            const c = cardCenter(card);
            const dx = center.x - c.x;
            const dy = center.y - c.y;
            const dist = Math.hypot(dx, dy);
            if (dist < RADIUS && dist > 0.01) {
              // Closer cards feel a stronger pull — the field radiates
              // outward from the center rather than applying evenly.
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
      // Nothing beyond ctx's own auto-cleanup: it cancels the rAF loop,
      // the rescan interval, and the click listener; archive.resetView()'s
      // follow-up rebuild is what actually clears any transform (and the
      // "magnet-center" class) this mode was still easing.
    },
  });
})();
