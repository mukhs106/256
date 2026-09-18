/* ------------------------------------------------------------------
   modes/drift.js
   "DRIFT" (symbols/6.svg) — while active, every photo carries its own
   persistent, cumulative offset from its normal spot: a slow organic
   wander ambiently moves it (heading drifts by small random turns each
   frame, so a card ambles off in a changing direction rather than
   tracing a fixed loop back through where it started), and the cursor
   passing near it shoves it firmly and immediately away, like a hand
   disturbing water. The two are the same physical quantity, not two
   separate terms added together — a push is just a strong, temporary
   contribution to a card's velocity, and once it decays back to
   ambient wandering speed the card simply keeps ambling on from
   wherever that push actually left it. Nothing here ever eases a card
   back toward its original spot: a pushed card stays pushed.

   Never touches click handling (no listener added or intercepted —
   clicking/isolation/scrolling all keep working exactly as they do in
   the plain archive), the same guarantee MAGNET makes, since this only
   ever writes a card's own `transform`.

   The simulation is plain velocity + position integration, not a
   spring: each frame adds (a) a small wander acceleration pointing
   along the card's own slowly-turning heading and (b) — only while the
   pointer is within PUSH_RADIUS of the card's actual current position
   — a much larger repulsion acceleration pointing straight away from
   the pointer, falling off with distance. Both are damped by drag each
   frame, which is what gives the motion its fluid (not rigid-body)
   feel and is also what naturally brings a push back down to ambient
   wander speed rather than needing a separate "settle" step. A card's
   cumulative offset is soft-capped at MAX_RANGE purely so a very long
   session can't wander a card arbitrarily far off-screen — the cap
   still never pulls a card back toward its start, it only stops
   pushing it further outward once it's already drifted that far.

   Pointer tracking mirrors MAGNET's approach for consistency: the last
   raw client coordinates are cached from pointermove, and converted to
   canvas-local coordinates fresh every animation frame via
   archive.screenToLocal() (zoom-aware — see its doc comment in app.js)
   rather than cached, so neither a scroll/pan nor a zoom change with no
   further mouse movement can leave a stale or mis-scaled point.

   Performance: the card list is only re-queried periodically via
   ctx.interval (also where per-card kinetic state is pruned once a
   card is no longer live), not every frame, and the base .photo-card
   transition is turned off for the duration (see
   body[data-mode="drift"] in style.css) so this mode's own per-frame
   motion is the only thing smoothing the transform.
------------------------------------------------------------------- */
(function () {
  const PUSH_RADIUS = 280; // px — how far from the pointer a card starts feeling the push
  const PUSH_ACCEL = 900; // px/s² — repulsion strength right at the pointer (falls off with distance below)
  const WANDER_ACCEL = 7; // px/s² — the small, constant push along a card's own current heading that drives ambient drift
  // A random walk's spread grows with sqrt(time), not time itself, so
  // the per-frame nudge below is scaled by sqrt(dt) rather than dt —
  // scaling by dt alone (an easy mistake) makes the total turn shrink
  // as frame time shrinks, leaving the heading barely moving at all
  // over many seconds instead of genuinely wandering. TURN_DIFFUSION is
  // tuned so the heading's spread reaches roughly a full radian (~57°)
  // over about 2 seconds — enough to visibly curve and double back
  // rather than holding one direction or tracing a fixed loop.
  const TURN_DIFFUSION = 1.3; // rad / sqrt(s)
  const DRAG = 1.6; // per second — velocity decay; also what pulls a push back down to ambient wander speed instead of a separate settle step
  const MAX_SPEED = 480; // px/s — hard velocity clamp, a safety net against runaway acceleration on a long/paused frame
  const MAX_RANGE = 340; // px — soft cap on cumulative offset from a card's original spot, so a long session can't send it arbitrarily far (never pulls it back inward, only stops pushing it further out)
  const ROT_FROM_VEL = 0.01; // deg per px/s of horizontal velocity — a faint tilt that tracks the motion, reinforcing the "surface" feel
  const MAX_ROT = 6; // deg
  const CARD_RESCAN_MS = 500; // how often the live card list is refreshed (pan/zoom loads and drops chunks)

  function cardHome(card) {
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
      const state = new Map(); // card el -> { x, y, vx, vy, heading } — kept for every live card the whole time DRIFT stays active

      function assign(card) {
        if (state.has(card)) return;
        state.set(card, { x: 0, y: 0, vx: 0, vy: 0, heading: Math.random() * Math.PI * 2 });
      }
      cards.forEach(assign);

      ctx.interval(() => {
        cards = ctx.archive.getCards();
        const live = new Set(cards);
        for (const key of state.keys()) {
          if (!live.has(key)) state.delete(key); // card's chunk was dropped — drop its kinetic state too
        }
        cards.forEach(assign); // existing cards keep their already-assigned state; only new ones start fresh
      }, CARD_RESCAN_MS);

      ctx.scratch.client = null;
      ctx.on(canvasWrap, "pointermove", (e) => {
        ctx.scratch.client = { x: e.clientX, y: e.clientY };
      });
      ctx.on(canvasWrap, "pointerleave", () => { ctx.scratch.client = null; });

      let lastT = null;

      ctx.loop((t) => {
        const dt = lastT === null ? 0 : Math.min(48, t - lastT) / 1000; // s, capped so a stalled tab can't fling a card on resume
        lastT = t;

        const client = ctx.scratch.client;
        const pointer = client ? ctx.archive.screenToLocal(client.x, client.y) : null;

        cards.forEach((card) => {
          const s = state.get(card);
          if (!s || dt <= 0) return;

          // Ambient wander: a small acceleration along the card's own
          // heading, which itself turns by a small random amount every
          // frame — an organic, ever-changing path rather than a fixed
          // periodic loop.
          s.heading += (Math.random() * 2 - 1) * TURN_DIFFUSION * Math.sqrt(dt);
          let ax = Math.cos(s.heading) * WANDER_ACCEL;
          let ay = Math.sin(s.heading) * WANDER_ACCEL;

          // Repulsion: strong and immediate, judged against the card's
          // actual current position (home + its cumulative offset), not
          // its original spot — a card that's already drifted somewhere
          // else still correctly feels the pointer relative to where it
          // really is now.
          if (pointer) {
            const home = cardHome(card);
            const cx = home.x + s.x, cy = home.y + s.y;
            const dx = cx - pointer.x; // away FROM the pointer
            const dy = cy - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < PUSH_RADIUS && dist > 0.01) {
              // Squared falloff reads softer near the edge of the radius
              // and firmer right under the pointer — closer to how a
              // real ripple's energy concentrates near its source.
              const strength = Math.pow(1 - dist / PUSH_RADIUS, 2) * PUSH_ACCEL;
              ax += (dx / dist) * strength;
              ay += (dy / dist) * strength;
            }
          }

          s.vx += ax * dt;
          s.vy += ay * dt;

          // Drag: fluid damping, and also what naturally brings a push
          // back down to ambient wander speed — there's no separate
          // "settle toward home" step anywhere in this file.
          const dragFactor = Math.max(0, 1 - DRAG * dt);
          s.vx *= dragFactor;
          s.vy *= dragFactor;

          const speed = Math.hypot(s.vx, s.vy);
          if (speed > MAX_SPEED) {
            const k = MAX_SPEED / speed;
            s.vx *= k; s.vy *= k;
          }

          s.x += s.vx * dt;
          s.y += s.vy * dt;

          // Soft-caps how far a card can cumulatively wander from its
          // original spot — bleeds off the outward component of its
          // velocity at the cap rather than pulling it back inward, so
          // it still never "returns", it just stops being pushed further.
          const range = Math.hypot(s.x, s.y);
          if (range > MAX_RANGE) {
            const k = MAX_RANGE / range;
            s.x *= k; s.y *= k;
            const radialX = s.x / MAX_RANGE, radialY = s.y / MAX_RANGE;
            const outward = s.vx * radialX + s.vy * radialY;
            if (outward > 0) {
              s.vx -= outward * radialX;
              s.vy -= outward * radialY;
            }
          }

          const rot = Math.max(-MAX_ROT, Math.min(MAX_ROT, s.vx * ROT_FROM_VEL));
          card.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
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
