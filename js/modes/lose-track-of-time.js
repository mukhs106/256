/* ------------------------------------------------------------------
   modes/lose-track-of-time.js
   "LOSE TRACK OF TIME" — the archive's own open-ended scroll (see
   generateRegion/extendCanvasIfNeeded in app.js) already has no fixed
   end; this mode adds the one thing that turns that into wandering
   rather than a feed: a small, quiet creature drifting through the
   same field.

   It's a single absolutely-positioned element living inside the
   canvas itself (so it scrolls with the photos, not over them like a
   HUD/cursor would), nudged toward a loosely-chosen point near some
   nearby photo, given a little time to hover once it arrives, then
   sent toward another. It never points, marks, or leads anywhere in
   particular — about 40% of its stops aren't near a photo at all — and
   nothing about it responds to the viewer, so it's just as easy to
   never notice as to follow for a while.

   Performance-wise this is one DOM node and one rAF loop for the
   entire mode, not per-image work, and it reads card positions from
   the inline left/top/width the layout already wrote (see cardBox()
   in play-with-the-rules.js — duplicated here in miniature rather than
   shared, to keep each mode file standalone) rather than
   getBoundingClientRect, so picking a new target never forces layout.
------------------------------------------------------------------- */
(function () {
  const SIZE = 16; // px
  const EASE = 0.035; // fraction of remaining distance closed per animation frame
  const ARRIVE_DIST = 16; // px — close enough to switch from flying to hovering
  const MIN_DWELL_MS = 3500;
  const MAX_DWELL_MS = 8000;
  const NEAR_CARD_CHANCE = 0.6; // rest of the time it picks an open point instead

  function cardCenter(el) {
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const width = parseFloat(el.style.width) || 0;
    const frame = el.querySelector(".photo-frame");
    const height = frame ? (parseFloat(frame.style.height) || 0) : 0;
    return { x: left + width / 2, y: top + height / 2 };
  }

  function pickTarget(ctx) {
    const canvasWrap = ctx.archive.getCanvasWrapEl();
    const canvasEl = ctx.archive.getCanvasEl();
    const viewTop = canvasWrap.scrollTop - 150;
    const viewBottom = canvasWrap.scrollTop + canvasWrap.clientHeight + 150;

    if (Math.random() < NEAR_CARD_CHANCE) {
      const nearby = ctx.archive.getCards().filter((c) => {
        const y = cardCenter(c).y;
        return y >= viewTop && y <= viewBottom;
      });
      if (nearby.length) {
        const card = nearby[Math.floor(Math.random() * nearby.length)];
        const c = cardCenter(card);
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 70;
        return { x: c.x + Math.cos(angle) * dist, y: c.y + Math.sin(angle) * dist };
      }
    }

    // An open point within (roughly) the visible field — either as the
    // 40% baseline, or a fallback when nothing's mounted nearby yet.
    return {
      x: Math.max(20, canvasEl.clientWidth * (0.1 + Math.random() * 0.8)),
      y: viewTop + Math.random() * (viewBottom - viewTop),
    };
  }

  ModeManager.register("lose-track-of-time", {
    label: "LOSE TRACK OF TIME",

    enter(ctx) {
      const canvasEl = ctx.archive.getCanvasEl();
      const canvasWrap = ctx.archive.getCanvasWrapEl();

      const creature = document.createElement("div");
      creature.className = "wander-lure";
      creature.setAttribute("aria-hidden", "true");
      creature.innerHTML =
        '<svg viewBox="0 0 20 20" width="' + SIZE + '" height="' + SIZE + '">' +
        '<g class="wander-lure-wings"><ellipse cx="6.5" cy="10" rx="6" ry="4"/><ellipse cx="13.5" cy="10" rx="6" ry="4"/></g>' +
        '<circle class="wander-lure-body" cx="10" cy="10" r="2.2"/>' +
        "</svg>";
      ctx.addTempNode(creature, canvasEl);

      ctx.scratch.pos = {
        x: canvasEl.clientWidth * (0.25 + Math.random() * 0.5),
        y: canvasWrap.scrollTop + canvasWrap.clientHeight * (0.25 + Math.random() * 0.5),
      };
      ctx.scratch.target = pickTarget(ctx);
      ctx.scratch.state = "flying";
      ctx.scratch.hoverUntil = 0;

      ctx.loop((t) => {
        const s = ctx.scratch;

        if (s.state === "flying") {
          const dx = s.target.x - s.pos.x, dy = s.target.y - s.pos.y;
          if (Math.hypot(dx, dy) < ARRIVE_DIST) {
            s.state = "hovering";
            s.hoverUntil = t + MIN_DWELL_MS + Math.random() * (MAX_DWELL_MS - MIN_DWELL_MS);
          } else {
            s.pos.x += dx * EASE;
            s.pos.y += dy * EASE;
          }
        } else if (t > s.hoverUntil) {
          s.target = pickTarget(ctx);
          s.state = "flying";
        }

        const wobble = s.state === "hovering" ? 6 : 3;
        const wx = Math.sin(t / 260) * wobble;
        const wy = Math.cos(t / 340) * (wobble * 0.75);
        creature.style.transform = `translate(${(s.pos.x + wx).toFixed(1)}px, ${(s.pos.y + wy).toFixed(1)}px)`;
      });
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: it removes the creature
      // node and cancels the loop above.
    },
  });
})();
