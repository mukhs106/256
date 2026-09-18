/* ------------------------------------------------------------------
   modes/magnet.js
   "MAGNET" (symbols/5.svg) — while active, only the photo the pointer
   is currently over feels the pull toward it, stronger the closer the
   pointer gets to that card's center; every other card is left alone.
   Moving on (or leaving the archive) eases that card back to its
   normal spot.

   Pressing and holding a card grabs it: while held, that one card
   drops the ambient falloff and instead eases toward the pointer
   directly (still eased, never a rigid 1:1 follow — an ordinary drag
   would snap straight to the cursor, this keeps catching up to it),
   with no cap on how far it can be carried — it tracks the pointer
   anywhere across the canvas. The longer the hold continues, the
   faster that catch-up gets, so the pull reads as progressively
   stronger the longer the card is held rather than a single fixed
   strength for the whole drag. Releasing it lets it fall straight
   back into the same ambient/eased behavior as every other card,
   which is what pulls it back to its normal spot rather than leaving
   it wherever it was dropped — a real magnet loses its hold, it
   doesn't leave the object stuck in place.

   A press only counts as a grab once it crosses a small movement
   threshold (below it, the existing click-to-isolate behavior still
   fires normally) — same technique PLAY WITH THE RULES uses — and only
   that one swallowed click is stopped, so nothing else about clicking/
   isolation/scrolling changes.

   The pointer's canvas-local position is recomputed every animation
   frame from the last raw client coordinates + a fresh
   getBoundingClientRect(), rather than being cached from the
   pointermove event itself — canvasEl pans/zooms, so a wheel-scroll or
   zoom with no further mouse movement would otherwise leave a stale
   canvas-local point that no longer lines up with whatever the cursor
   now sits over.

   Performance: the card list is only re-queried periodically via
   ctx.interval (also where stale offset state is pruned), not every
   frame, and the base .photo-card transition is turned off for the
   duration (see body[data-mode="magnet"] in style.css) so this mode's
   own per-frame easing is the only thing smoothing the motion.
------------------------------------------------------------------- */
(function () {
  const RADIUS = 230; // px — how far from the pointer the hovered card starts feeling the ambient pull
  const MAX_PULL = 32; // px — the ambient pull's strongest offset, right at the pointer
  const EASE = 0.16; // fraction of the remaining gap an ambient offset closes per frame
  const DRAG_THRESHOLD = 4; // px of pointer movement before a press counts as a grab, not a click
  const GRAB_EASE = 0.24; // catch-up fraction at the moment a card is grabbed
  const GRAB_EASE_MAX = 0.7; // catch-up fraction the hold strength grows toward, for a progressively firmer pull
  const GRAB_EASE_GROWTH = 0.35; // per second — how fast the hold strength climbs from GRAB_EASE toward GRAB_EASE_MAX
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

      ctx.interval(() => {
        cards = ctx.archive.getCards();
        const live = new Set(cards);
        for (const key of offsets.keys()) {
          if (!live.has(key)) offsets.delete(key); // card's chunk was dropped — drop its offset state too
        }
      }, CARD_RESCAN_MS);

      // Raw viewport coordinates from the last pointermove, or null when
      // the pointer isn't known to be over the archive — the canvas-local
      // point derived from these is recomputed fresh every frame below.
      ctx.scratch.client = null;
      ctx.scratch.hoverCard = null; // the single card currently under the pointer — the only one the ambient pull acts on
      ctx.on(canvasWrap, "pointermove", (e) => {
        ctx.scratch.client = { x: e.clientX, y: e.clientY };
        ctx.scratch.hoverCard = e.target.closest(".photo-card");
      });
      ctx.on(canvasWrap, "pointerleave", () => {
        ctx.scratch.client = null;
        ctx.scratch.hoverCard = null;
      });

      // ---- grab-to-drag: which card (if any) is currently held ----
      let grab = null; // { card, pointerId, startX, startY, dragging }
      let justDragged = false;

      ctx.on(canvasEl, "pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (grab) return; // ignore a second pointer landing while one is already held
        const card = e.target.closest(".photo-card");
        if (!card) return;
        grab = { card, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dragging: false };
        card.setPointerCapture(e.pointerId);
      });

      ctx.on(canvasEl, "pointermove", (e) => {
        if (!grab || grab.pointerId !== e.pointerId) return;
        if (!grab.dragging) {
          const dx = e.clientX - grab.startX, dy = e.clientY - grab.startY;
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          grab.dragging = true;
          grab.startT = performance.now(); // when the hold began, so the pull can grow stronger the longer it's held
          grab.card.classList.add("magnet-grabbed");
        }
      });

      function releaseGrab(e) {
        if (!grab || grab.pointerId !== e.pointerId) return;
        if (grab.card.hasPointerCapture(e.pointerId)) grab.card.releasePointerCapture(e.pointerId);
        if (grab.dragging) {
          grab.card.classList.remove("magnet-grabbed");
          justDragged = true; // swallow the click this pointerup would otherwise also fire
        }
        grab = null;
      }
      ctx.on(canvasEl, "pointerup", releaseGrab);
      ctx.on(canvasEl, "pointercancel", releaseGrab);

      // A finished drag ending under the pointer would otherwise also
      // pop the photo into isolation right after release — swallow
      // exactly that one click, nothing else (a plain, un-dragged click
      // still opens isolation as it always has).
      ctx.on(canvasEl, "click", (e) => {
        if (justDragged) {
          e.stopPropagation();
          e.preventDefault();
          justDragged = false;
        }
      }, true);

      ctx.loop((t) => {
        const client = ctx.scratch.client;
        let pointer = null;
        if (client) {
          const rect = canvasEl.getBoundingClientRect();
          pointer = { x: client.x - rect.left, y: client.y - rect.top };
        }

        const activeCard = (grab && grab.dragging) ? grab.card : ctx.scratch.hoverCard;

        cards.forEach((card) => {
          const isGrabbed = grab && grab.dragging && grab.card === card;
          const isActive = card === activeCard;
          let targetX = 0, targetY = 0;

          // Only the one card being hovered, clicked, or dragged ever gets
          // a non-zero target — every other card's offset (if it still has
          // one from a moment ago) simply eases back toward zero below.
          if (pointer && isActive) {
            const c = cardCenter(card);
            const dx = pointer.x - c.x;
            const dy = pointer.y - c.y;
            const dist = Math.hypot(dx, dy);
            if (isGrabbed) {
              // No cap here: a held card tracks the pointer anywhere across
              // the canvas rather than being boxed into a fixed reach.
              targetX = dx;
              targetY = dy;
            } else if (dist < RADIUS && dist > 0.01) {
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

          let ease = EASE;
          if (isGrabbed) {
            const heldSeconds = (t - grab.startT) / 1000;
            ease = Math.min(GRAB_EASE_MAX, GRAB_EASE + heldSeconds * GRAB_EASE_GROWTH);
          }
          cur.x += (targetX - cur.x) * ease;
          cur.y += (targetY - cur.y) * ease;

          if (!isGrabbed && targetX === 0 && targetY === 0 && Math.abs(cur.x) < 0.05 && Math.abs(cur.y) < 0.05) {
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
      // and the rescan interval and removes the pointer listeners;
      // archive.resetView()'s follow-up rebuild is what actually clears
      // any transform this mode was still easing (grabbed or not).
    },
  });
})();
