/* ------------------------------------------------------------------
   modes/drift.js
   "DRIFT" (symbols/6.svg) — while active, photos ripple away from the
   pointer as it moves across the field, like a hand passing over the
   surface of water: the nearer a card is to the cursor, the more it's
   pushed aside, easing back to its normal spot as the cursor moves on
   or leaves. Never touches click handling (no listener added or
   intercepted — clicking/isolation/scrolling all keep working exactly
   as they do in the plain archive), the same guarantee MAGNET makes,
   since this only ever writes a card's own `transform`.

   The "ripple" read comes from a light spring-damper per card (not a
   plain lerp): each frame nudges the card's velocity toward the target
   displacement and lets that velocity carry it, with damping pulling
   it back down — under-damped just enough to overshoot and settle
   rather than snap straight to target, which is what makes it feel
   fluid rather than mechanical. Offsets are hard-clamped to MAX_OFFSET
   so a fast cursor swipe or the spring's own overshoot can never carry
   a card meaningfully away from its spot.

   Pointer tracking mirrors MAGNET's approach for consistency: the last
   raw client coordinates are cached from pointermove, and the
   canvas-local point is recomputed fresh every animation frame from a
   live getBoundingClientRect() rather than cached, so a scroll/pan with
   no further mouse movement can't leave a stale point.

   Performance: the card list is only re-queried periodically via
   ctx.interval (also where per-card spring state is pruned once a card
   is no longer live), not every frame, and the base .photo-card
   transition is turned off for the duration (see
   body[data-mode="drift"] in style.css) so this mode's own per-frame
   spring is the only thing smoothing the motion.
------------------------------------------------------------------- */
(function () {
  const RADIUS = 240; // px — how far from the pointer a card starts feeling the ripple
  const MAX_PUSH = 46; // px — the strongest push, right at the pointer (soft-falloff curve below, not linear)
  const MAX_OFFSET = 60; // px — hard clamp so the spring's own overshoot can never carry a card far from its spot
  const STIFFNESS = 140; // spring constant — how hard the offset is pulled toward its target
  const DAMPING = 16; // spring damping — under STIFFNESS's critical damping (~23.7) on purpose, for a light overshoot/settle rather than a dead stop
  const ROT_FROM_VEL = 0.012; // deg per px/s of horizontal velocity — a faint tilt that tracks the motion, reinforcing the "surface" feel
  const MAX_ROT = 3; // deg
  const CARD_RESCAN_MS = 500; // how often the live card list is refreshed (pan/zoom loads and drops chunks)

  function cardCenter(card) {
    const left = parseFloat(card.style.left) || 0;
    const top = parseFloat(card.style.top) || 0;
    const width = parseFloat(card.style.width) || 0;
    const frame = card.querySelector(".photo-frame");
    const height = frame ? (parseFloat(frame.style.height) || 0) : 0;
    return { x: left + width / 2, y: top + height / 2 };
  }

  ModeManager.register("drift", {
    label: "DRIFT",

    enter(ctx) {
      const canvasEl = ctx.archive.getCanvasEl();
      const canvasWrap = ctx.archive.getCanvasWrapEl();

      let cards = ctx.archive.getCards();
      const springs = new Map(); // card el -> { ox, oy, vx, vy }, only kept while live/non-zero

      ctx.interval(() => {
        cards = ctx.archive.getCards();
        const live = new Set(cards);
        for (const key of springs.keys()) {
          if (!live.has(key)) springs.delete(key); // card's chunk was dropped — drop its spring state too
        }
      }, CARD_RESCAN_MS);

      ctx.scratch.client = null;
      ctx.on(canvasWrap, "pointermove", (e) => {
        ctx.scratch.client = { x: e.clientX, y: e.clientY };
      });
      ctx.on(canvasWrap, "pointerleave", () => { ctx.scratch.client = null; });

      let lastT = null;

      ctx.loop((t) => {
        const dt = lastT === null ? 0 : Math.min(48, t - lastT) / 1000; // s, capped so a stalled tab can't fling the spring on resume
        lastT = t;

        const client = ctx.scratch.client;
        let pointer = null;
        if (client) {
          const rect = canvasEl.getBoundingClientRect();
          pointer = { x: client.x - rect.left, y: client.y - rect.top };
        }

        cards.forEach((card) => {
          const c = cardCenter(card);
          let targetX = 0, targetY = 0;

          if (pointer) {
            const dx = c.x - pointer.x; // away FROM the pointer — a ripple pushes outward, unlike MAGNET's pull
            const dy = c.y - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < RADIUS && dist > 0.01) {
              // Squared falloff (vs. MAGNET's linear one) reads softer near the
              // edge of the radius and firmer right under the pointer — closer
              // to how a real ripple's energy concentrates near its source.
              const strength = Math.pow(1 - dist / RADIUS, 2) * MAX_PUSH;
              targetX = (dx / dist) * strength;
              targetY = (dy / dist) * strength;
            }
          }

          let s = springs.get(card);
          if (!s) {
            if (targetX === 0 && targetY === 0) return; // never rippled, nothing to spring
            s = { ox: 0, oy: 0, vx: 0, vy: 0 };
            springs.set(card, s);
          }

          if (dt > 0) {
            const ax = (targetX - s.ox) * STIFFNESS - s.vx * DAMPING;
            const ay = (targetY - s.oy) * STIFFNESS - s.vy * DAMPING;
            s.vx += ax * dt;
            s.vy += ay * dt;
            s.ox += s.vx * dt;
            s.oy += s.vy * dt;
          }

          const mag = Math.hypot(s.ox, s.oy);
          if (mag > MAX_OFFSET) {
            const k = MAX_OFFSET / mag;
            s.ox *= k; s.oy *= k;
            s.vx *= 0.5; s.vy *= 0.5; // bleed off velocity at the clamp so it doesn't just keep pressing against it
          }

          const settled = targetX === 0 && targetY === 0
            && Math.abs(s.ox) < 0.05 && Math.abs(s.oy) < 0.05
            && Math.abs(s.vx) < 0.05 && Math.abs(s.vy) < 0.05;

          if (settled) {
            card.style.transform = "";
            springs.delete(card);
          } else {
            const rot = Math.max(-MAX_ROT, Math.min(MAX_ROT, s.vx * ROT_FROM_VEL));
            card.style.transform = `translate(${s.ox.toFixed(1)}px, ${s.oy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
          }
        });
      });
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: it cancels the rAF loop,
      // the rescan interval, and the pointermove/pointerleave listeners;
      // archive.resetView()'s follow-up rebuild returns every card to
      // its plain, undisplaced position.
    },
  });
})();
