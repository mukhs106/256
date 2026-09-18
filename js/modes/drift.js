/* ------------------------------------------------------------------
   modes/drift.js
   "DRIFT" (symbols/6.svg) — while active, every photo continuously and
   independently wanders a few px around its normal spot (each on its
   own randomized timing, so the field never reads as one synchronized
   animation), while also rippling away from the pointer as it moves
   across the field, like a hand passing over the surface of water: the
   nearer a card is to the cursor, the more it's pushed aside on top of
   its own drift, easing back to just its drift baseline — never a
   fixed, undisplaced spot — as the cursor moves on or leaves. Never
   touches click handling (no listener added or intercepted —
   clicking/isolation/scrolling all keep working exactly as they do in
   the plain archive), the same guarantee MAGNET makes, since this only
   ever writes a card's own `transform`.

   The two motions are additive and independently computed per frame:
   the drift term is a closed-form function of time (sin/cos with a
   per-card amplitude, period and phase — nothing to ease toward), and
   the ripple term is a light spring-damper (not a plain lerp): each
   frame nudges the ripple's own velocity toward its target displacement
   and lets that velocity carry it, with damping pulling it back down —
   under-damped just enough to overshoot and settle rather than snap
   straight to target, which is what makes the push feel fluid rather
   than mechanical. The ripple offset is hard-clamped to MAX_OFFSET so a
   fast cursor swipe or the spring's own overshoot can never carry a
   card meaningfully away from its (still-drifting) spot.

   Pointer tracking mirrors MAGNET's approach for consistency: the last
   raw client coordinates are cached from pointermove, and converted to
   canvas-local coordinates fresh every animation frame via
   archive.screenToLocal() (zoom-aware — see its doc comment in app.js)
   rather than cached, so neither a scroll/pan nor a zoom change with no
   further mouse movement can leave a stale or mis-scaled point.

   Performance: the card list is only re-queried periodically via
   ctx.interval (also where per-card drift/spring state is pruned once
   a card is no longer live), not every frame, and the base .photo-card
   transition is turned off for the duration (see
   body[data-mode="drift"] in style.css) so this mode's own per-frame
   motion is the only thing smoothing the transform.
------------------------------------------------------------------- */
(function () {
  const RADIUS = 260; // px — how far from the pointer a card starts feeling the ripple (was 240)
  const MAX_PUSH = 95; // px — the strongest push, right at the pointer (was 46) — a hand disturbing water should shove it clear, not nudge it
  const MAX_OFFSET = 120; // px — hard clamp so the spring's own overshoot can never carry the ripple far from its drift baseline (raised alongside MAX_PUSH so the stronger push isn't immediately clipped)
  const STIFFNESS = 140; // spring constant — how hard the offset is pulled toward its target
  const DAMPING = 16; // spring damping — under STIFFNESS's critical damping (~23.7) on purpose, for a light overshoot/settle rather than a dead stop
  const ROT_FROM_VEL = 0.012; // deg per px/s of horizontal velocity — a faint tilt that tracks the ripple's motion, reinforcing the "surface" feel
  const MAX_ROT = 4; // deg — clamp on the ripple's own contribution to rotation (was 3, nudged up alongside the stronger push)
  const MAX_TOTAL_ROT = 6; // deg — clamp on drift + ripple rotation combined (was 5)
  const CARD_RESCAN_MS = 500; // how often the live card list is refreshed (pan/zoom loads and drops chunks)

  const AMP_XY = [4, 11]; // px, per-axis drift amplitude range
  const AMP_ROT = [0.6, 2.2]; // deg, drift rotation amplitude range
  // Used below as `sin(t / PERIOD_MS + phase)`, so a full cycle actually
  // takes 2*PI times longer than this value (e.g. 500 -> ~3.1s, not
  // 500ms) — the original [3500, 7500] range was accordingly a very
  // slow ~22-47s per cycle. This range instead targets a genuinely
  // noticeable ~2.2-5s per cycle, kept independent per axis/card so
  // nothing lines up.
  const PERIOD_MS = [350, 800];

  function rand([lo, hi]) { return lo + Math.random() * (hi - lo); }

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
      const canvasWrap = ctx.archive.getCanvasWrapEl();

      let cards = ctx.archive.getCards();
      const springs = new Map(); // card el -> { ox, oy, vx, vy }, only kept while live/rippling
      const params = new Map(); // card el -> its own randomized drift amplitude/period/phase, kept for every live card

      function assignDrift(card) {
        if (params.has(card)) return;
        params.set(card, {
          ax: rand(AMP_XY), ay: rand(AMP_XY), arot: rand(AMP_ROT),
          px: rand(PERIOD_MS), py: rand(PERIOD_MS), prot: rand(PERIOD_MS),
          phx: Math.random() * Math.PI * 2,
          phy: Math.random() * Math.PI * 2,
          phrot: Math.random() * Math.PI * 2,
        });
      }
      cards.forEach(assignDrift);

      ctx.interval(() => {
        cards = ctx.archive.getCards();
        const live = new Set(cards);
        for (const key of springs.keys()) {
          if (!live.has(key)) springs.delete(key); // card's chunk was dropped — drop its spring state too
        }
        for (const key of params.keys()) {
          if (!live.has(key)) params.delete(key); // ditto for its drift state
        }
        cards.forEach(assignDrift); // existing cards keep their already-assigned drift; only new ones get fresh params
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
        const pointer = client ? ctx.archive.screenToLocal(client.x, client.y) : null;

        cards.forEach((card) => {
          // The continuous drift term — always live, a closed-form function
          // of time, so it never needs to "settle": it just keeps wandering.
          const p = params.get(card);
          const driftX = p ? Math.sin(t / p.px + p.phx) * p.ax : 0;
          const driftY = p ? Math.cos(t / p.py + p.phy) * p.ay : 0;
          const driftRot = p ? Math.sin(t / p.prot + p.phrot) * p.arot : 0;

          // The ripple term — a spring-eased push away from the pointer,
          // computed from the card's plain (undrifted) home position so the
          // push itself doesn't chase the small drift wobble.
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
          if (s || targetX !== 0 || targetY !== 0) {
            if (!s) {
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

            if (settled) springs.delete(card); // ripple fully spent — the drift term above keeps the card moving on its own
          }

          // Settling back to "natural position" means back to the drift
          // baseline, not a hard stop — DRIFT never leaves a card static.
          const rippleRot = s ? Math.max(-MAX_ROT, Math.min(MAX_ROT, s.vx * ROT_FROM_VEL)) : 0;
          const totalX = driftX + (s ? s.ox : 0);
          const totalY = driftY + (s ? s.oy : 0);
          const totalRot = Math.max(-MAX_TOTAL_ROT, Math.min(MAX_TOTAL_ROT, driftRot + rippleRot));
          card.style.transform = `translate(${totalX.toFixed(1)}px, ${totalY.toFixed(1)}px) rotate(${totalRot.toFixed(2)}deg)`;
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
