/* ------------------------------------------------------------------
   modes/magnet.js
   "MAGNET" (symbols/5.svg) — press a photo to make it the field's
   center: it stays exactly where it is (never dragged, never pulled
   itself), while every OTHER card within range eases toward it,
   pulled harder the closer it already is — a field radiating from the
   selected photo, not a cursor-follow effect. The field also grows
   the longer the center is continuously held down (see GROWTH_SECONDS
   below): both its reach and its pull strength ramp up toward a grown
   maximum the longer the press lasts, dropping back to the base
   strength the instant it's released (still eased, so nothing about
   that ever snaps). Clicking the already-selected center again turns
   the field off; pressing a different card moves the center there
   instead — right away, so a fresh selection can start growing during
   that same press rather than needing a second one — which also
   releases whatever the previous center was pulling toward it: it
   becomes an ordinary pullable card again the very next frame, now
   judged against the new center.

   Selecting/deselecting the center is how a click gets used here, so a
   click never opens isolation while this mode is active — the
   capture-phase listener below intercepts it, same technique
   DUPLICATES uses to repurpose a click for its own mode-specific
   gesture; nothing about scrolling or the cards themselves changes.

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
  const RADIUS = 360; // px — how far from the center card the field reaches at rest
  const MAX_PULL = 75; // px — the strongest pull (right next to the center) at rest
  const RADIUS_GROWN = 520; // px — the field's reach once the center has been held the full GROWTH_SECONDS
  const MAX_PULL_GROWN = 150; // px — the strongest pull once fully grown
  const GROWTH_SECONDS = 3; // how long a continuous press on the center takes to reach the grown strength above
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

      // Tracks how long the current center has been continuously held
      // down, for the field's own growth (see GROWTH_SECONDS above) —
      // pressWasCenter is captured at press time so the later "click"
      // (which fires on release) can tell whether this press just
      // selected a fresh center (leave it selected) or re-pressed the
      // one that was already selected (that's what should deselect it).
      let pressedCard = null;
      let pressStartT = 0;
      let pressWasCenter = false;

      ctx.on(canvasEl, "pointerdown", (e) => {
        const card = e.target.closest(".photo-card");
        if (!card) return;
        pressedCard = card;
        pressStartT = performance.now();
        pressWasCenter = card === centerCard;
        // A press on a not-yet-selected card makes it the center right
        // away rather than waiting for release, so the field can start
        // growing during this very same press.
        if (!pressWasCenter) setCenter(card);
      });

      function clearPress() {
        pressedCard = null;
      }
      ctx.on(canvasEl, "pointerup", clearPress);
      ctx.on(canvasEl, "pointercancel", clearPress);

      ctx.on(canvasEl, "click", (e) => {
        const card = e.target.closest(".photo-card");
        if (!card) return; // clicking open space doesn't touch the field
        e.stopPropagation();
        e.preventDefault();
        // Re-clicking the card that was already the center when this
        // press started turns the field off; clicking to select a new
        // one is already handled by the pointerdown above.
        if (pressWasCenter && card === centerCard) setCenter(null);
      }, true);

      ctx.loop((t) => {
        const center = centerCard ? cardCenter(centerCard) : null;

        // The field grows for as long as the center is continuously
        // held down, and drops back to the base strength the instant
        // it's released (still eased below, so it's never a snap) —
        // growth is 0 whenever the center isn't actively being pressed
        // right now, not just frozen wherever it last reached.
        let growth = 0;
        if (centerCard && pressedCard === centerCard) {
          growth = Math.min(1, (t - pressStartT) / 1000 / GROWTH_SECONDS);
        }
        const radius = RADIUS + (RADIUS_GROWN - RADIUS) * growth;
        const maxPull = MAX_PULL + (MAX_PULL_GROWN - MAX_PULL) * growth;

        cards.forEach((card) => {
          if (card === centerCard) return; // the center holds still — never eased, never offset

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
      // the rescan interval, and the click listener; archive.resetView()'s
      // follow-up rebuild is what actually clears any transform (and the
      // "magnet-center" class) this mode was still easing.
    },
  });
})();
