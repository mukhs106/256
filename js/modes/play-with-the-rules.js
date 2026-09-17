/* ------------------------------------------------------------------
   modes/play-with-the-rules.js
   "PLAY WITH THE RULES" — turns the scattered field into a physically
   manipulable one. Photos become pick-up-and-move objects; the archive
   itself never changes, only the DOM this mode is currently disturbing
   — switching to any other symbol (or a double-click on open space,
   see below) rebuilds the field straight from the permanent data, so
   nothing dragged here is ever kept.

   How it works:
     - One delegated pointerdown listener on the canvas (not one per
       card) detects a press on a .photo-card and hands it to
       startDrag(), which does the actual per-gesture work: it moves
       the card by writing left/top directly (position:absolute — no
       fighting the card's own rotate transform), and adds/removes its
       own pointermove/pointerup listeners straight on that one card
       for the life of the gesture, via native addEventListener rather
       than ctx.on, since those need to come and go per-drag, not just
       once at mode exit.
     - Crossing a small movement threshold is what turns a press into a
       drag (below it, the existing click-to-isolate behavior still
       fires normally) and is also the moment a handful of nearby cards
       get a small, temporary nudge — the "disrupt nearby order" cue —
       which eases back via the .photo-card transform transition
       already in style.css.
     - A delegated capture-phase click listener swallows just the one
       click that a finished drag would otherwise also fire (which
       would pop the photo into isolation right after release).
------------------------------------------------------------------- */
(function () {
  const DRAG_THRESHOLD = 4; // px of pointer movement before a press counts as a drag
  const NEIGHBOR_RADIUS = 260; // px, canvas-local — how far a nudge reaches
  const MAX_NEIGHBORS = 5;
  const RETRIGGER_DIST = 90; // px of continued drag travel before nearby cards get nudged again

  // Cheap position lookup — reads the inline styles the layout already
  // wrote (see placeImage() in app.js) instead of getBoundingClientRect,
  // so checking every card's position never forces a layout reflow.
  function cardBox(el) {
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const width = parseFloat(el.style.width) || 0;
    const frame = el.querySelector(".photo-frame");
    const height = frame ? (parseFloat(frame.style.height) || 0) : 0;
    return { left, top, width, height, cx: left + width / 2, cy: top + height / 2 };
  }

  function settleNeighbors(ctx) {
    if (!ctx.scratch.nudged) return;
    ctx.scratch.nudged.forEach(({ el, base }) => { el.style.transform = base; });
    ctx.scratch.nudged = null;
  }

  // Gives a handful of the cards nearest `card` a small random
  // rotate/shift, strongest for the closest ones. Settles whatever was
  // nudged before, so re-calling this as a drag continues reads as one
  // ripple moving with the dragged photo rather than a pile-up.
  function nudgeNeighbors(ctx, card) {
    const box = cardBox(card);
    const near = [];
    for (const other of ctx.archive.getCards()) {
      if (other === card) continue;
      const b = cardBox(other);
      const d = Math.hypot(b.cx - box.cx, b.cy - box.cy);
      if (d < NEIGHBOR_RADIUS) near.push({ el: other, d });
    }
    near.sort((a, b) => a.d - b.d);

    settleNeighbors(ctx);
    ctx.scratch.nudged = near.slice(0, MAX_NEIGHBORS).map(({ el, d }) => {
      const base = el.style.transform || "";
      const strength = 1 - d / NEIGHBOR_RADIUS;
      const rot = (Math.random() * 2 - 1) * 6 * strength;
      const tx = (Math.random() * 2 - 1) * 6 * strength;
      const ty = (Math.random() * 2 - 1) * 6 * strength;
      el.style.transform = `${base} translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      return { el, base };
    });
  }

  function startDrag(ctx, card, e) {
    if (card.dataset.dragging === "1") return; // ignore a second pointer landing on the same card
    card.dataset.dragging = "1";

    const baseTransform = card.style.transform || "";
    const startX = e.clientX, startY = e.clientY;
    const startLeft = parseFloat(card.style.left) || 0;
    const startTop = parseFloat(card.style.top) || 0;
    let dragging = false;
    let lastNudgeDx = 0, lastNudgeDy = 0;

    card.setPointerCapture(e.pointerId);

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        card.classList.add("dragging");
        card.style.transform = `${baseTransform} scale(1.05)`; // a small "lifted off the table" cue
        nudgeNeighbors(ctx, card);
        lastNudgeDx = dx; lastNudgeDy = dy;
      }

      card.style.left = (startLeft + dx) + "px";
      card.style.top = (startTop + dy) + "px";

      if (Math.hypot(dx - lastNudgeDx, dy - lastNudgeDy) > RETRIGGER_DIST) {
        nudgeNeighbors(ctx, card);
        lastNudgeDx = dx; lastNudgeDy = dy;
      }
    }

    function onUp() {
      card.releasePointerCapture(e.pointerId);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerup", onUp);
      card.removeEventListener("pointercancel", onUp);
      delete card.dataset.dragging;

      if (dragging) {
        card.classList.remove("dragging");
        card.style.transform = baseTransform;
        settleNeighbors(ctx);
        ctx.scratch.justDragged = true;
      }
    }

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onUp);
  }

  ModeManager.register("play-with-the-rules", {
    label: "PLAY WITH THE RULES",

    enter(ctx) {
      ctx.scratch.justDragged = false;

      const canvasEl = ctx.archive.getCanvasEl();
      const canvasWrap = ctx.archive.getCanvasWrapEl();

      ctx.on(canvasEl, "pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const card = e.target.closest(".photo-card");
        if (card) startDrag(ctx, card, e);
      });

      // A drag ending under the pointer would otherwise also fire a
      // click right after release and pop that photo into isolation —
      // swallow exactly that one click, nothing else.
      ctx.on(canvasEl, "click", (e) => {
        if (ctx.scratch.justDragged) {
          e.stopPropagation();
          e.preventDefault();
          ctx.scratch.justDragged = false;
        }
      }, true);

      // Double-clicking open space (not a photo) shuffles the field
      // back to its normal arrangement without leaving the mode.
      ctx.on(canvasWrap, "dblclick", (e) => {
        if (!e.target.closest(".photo-card")) ctx.archive.rerender();
      });
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: it removes the listeners
      // above, and ModeManager's follow-up archive reset rebuilds every
      // card from scratch, which is also what discards any nudge/drag
      // still in progress.
    },
  });
})();
