/* ------------------------------------------------------------------
   effects/earthquake.js
   symbols/1.svg — an instant trigger, not a mode: clicking it makes
   every currently-visible photo do its own small, playful wiggle —
   a slightly randomized shimmy in position/rotation, with a minority
   of cards also popping up in scale as if sparkling — and let go again
   on its own. A modest, random handful of nearby card pairs also swap
   places while they wiggle, so the field feels like it's magically
   rearranging itself mid-shimmy rather than just jittering in place.
   See js/modes-config.js (SYMBOL_FX_CONFIG) for how a symbol gets
   wired to this. (The export stays window.SymbolFX.earthquake — only
   the motion changed, not the wiring.)

   Each card gets its own randomized amplitude/rotation, start delay,
   and duration, so the wiggle reads as many independent little dances
   rather than one synchronized pulse — the opposite of the previous
   whole-canvas shake this replaced.

   The animation targets each card's OWN .photo-frame, never the
   .photo-card itself: MAGNET and DRIFT write a card's transform every
   animation frame while they're active, and an instant effect never
   deactivates whatever mode is currently running (see app.js's
   handleSymbolActivate) — so triggering this while either of those
   modes is live must not fight over the same property. Animating the
   inner frame instead means the two simply compose (the card can be
   mid-drift while its frame does its own wiggle) with nothing to
   reconcile.

   The shuffle itself swaps two cards' actual position AND size
   (left/top/width/frame-height, plus z-index) — never their content —
   so each card keeps its own identity/click handler exactly as it
   was (clicking a swapped photo still opens the right one in
   isolation) and the masonry packing stays perfectly intact (a swap
   just relabels which photo sits in which of two existing slots,
   never changes the slots themselves). To read as a glide rather than
   a snap, each swapped card's frame gets a --shuffle-dx/--shuffle-dy
   custom property (the vector back to where it visually was) that
   cardWiggle's keyframes (see style.css) blend down to zero over the
   same duration as the wiggle itself, so the "move" and the "wiggle"
   play out as one continuous motion rather than two competing ones.
   Pairing is restricted to cards already near each other (see
   MAX_SWAP_DIST) so a swap always reads as trading places with a
   neighbor, never a long-distance teleport.

   Each card's keyframe (cardWiggle in style.css) both starts and ends
   at the identity transform (plus, for a swapped card, its own
   --shuffle-dx/dy decaying to 0 — see above), so nothing needs to be
   cleaned up beyond removing the class again once the animation
   finishes — handled here via a one-off "animationend" listener per
   card.
------------------------------------------------------------------- */
(function () {
  const WIG_X = [4, 9]; // px, per-card horizontal wiggle amplitude range
  const WIG_Y = [4, 9]; // px, per-card vertical wiggle amplitude range
  const WIG_ROT = [4, 10]; // deg, per-card rotation amplitude range
  const POP_CHANCE = 0.22; // fraction of cards that also get a scale "pop"
  const POP_AMT = [0.10, 0.22]; // extra scale magnitude for popping cards
  const DELAY_MAX_MS = 140; // random per-card start offset, so the dance staggers rather than firing in lockstep
  const DURATION_MS = [520, 820]; // per-card animation duration range

  const SHUFFLE_FRACTION = 0.18; // fraction of cards considered as swap candidates — a subtle sprinkle, not a full reshuffle
  const MAX_SHUFFLE_PAIRS = 14; // hard cap on how many pairs can swap at once, regardless of collection size
  const MAX_SWAP_DIST = 260; // px (local/world units) — a candidate only swaps with the nearest OTHER candidate within this reach, so it always reads as trading places with a neighbor, never teleporting across the field

  function rand([lo, hi]) { return lo + Math.random() * (hi - lo); }
  function signed(range) { return (Math.random() < 0.5 ? -1 : 1) * rand(range); }

  function shuffledCopy(list) {
    const order = list.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  function cardGeometry(card) {
    const frame = card.querySelector(".photo-frame");
    if (!frame) return null;
    const left = parseFloat(card.style.left) || 0;
    const top = parseFloat(card.style.top) || 0;
    const width = parseFloat(card.style.width) || 0;
    const height = parseFloat(frame.style.height) || 0;
    return { card, frame, left, top, width, height, cx: left + width / 2, cy: top + height / 2 };
  }

  // Swaps a and b's position/size (never their content), then primes
  // each frame's --shuffle-dx/--shuffle-dy so cardWiggle can glide it
  // in from where it visually used to be.
  function swapPlaces(a, b) {
    a.card.style.left = b.left + "px";
    a.card.style.top = b.top + "px";
    a.card.style.width = b.width + "px";
    a.frame.style.height = b.height + "px";

    b.card.style.left = a.left + "px";
    b.card.style.top = a.top + "px";
    b.card.style.width = a.width + "px";
    b.frame.style.height = a.height + "px";

    const az = a.card.style.zIndex;
    a.card.style.zIndex = b.card.style.zIndex;
    b.card.style.zIndex = az;

    a.frame.style.setProperty("--shuffle-dx", (a.left - b.left).toFixed(1) + "px");
    a.frame.style.setProperty("--shuffle-dy", (a.top - b.top).toFixed(1) + "px");
    b.frame.style.setProperty("--shuffle-dx", (b.left - a.left).toFixed(1) + "px");
    b.frame.style.setProperty("--shuffle-dy", (b.top - a.top).toFixed(1) + "px");
  }

  // Pairs up a modest, random subset of cards with a nearby neighbor
  // and swaps each pair's place. Returns nothing — mutates the DOM
  // directly, same as the wiggle loop that follows it.
  function shufflePairs(cards) {
    const candidates = shuffledCopy(cards)
      .slice(0, Math.round(cards.length * SHUFFLE_FRACTION))
      .map(cardGeometry)
      .filter(Boolean);

    const used = new Set();
    let pairs = 0;
    for (const a of candidates) {
      if (pairs >= MAX_SHUFFLE_PAIRS) break;
      if (used.has(a.card)) continue;

      let nearest = null, nearestDist = Infinity;
      for (const b of candidates) {
        if (b === a || used.has(b.card)) continue;
        const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        if (dist < nearestDist) { nearest = b; nearestDist = dist; }
      }

      if (nearest && nearestDist <= MAX_SWAP_DIST) {
        swapPlaces(a, nearest);
        used.add(a.card);
        used.add(nearest.card);
        pairs++;
      }
    }
  }

  function triggerWiggle(archive) {
    const cards = archive && archive.getCards && archive.getCards();
    if (!cards || !cards.length) return;

    // Clear any leftover glide-in offset from a previous trigger before
    // picking this trigger's pairs, so a card that isn't shuffled this
    // time never keeps an old offset around.
    cards.forEach((card) => {
      const frame = card.querySelector(".photo-frame");
      if (frame) {
        frame.style.removeProperty("--shuffle-dx");
        frame.style.removeProperty("--shuffle-dy");
      }
    });

    shufflePairs(cards);

    cards.forEach((card) => {
      const frame = card.querySelector(".photo-frame");
      if (!frame) return;

      // Restart cleanly even if this card is still mid-wiggle from a
      // rapid re-click of the symbol.
      frame.classList.remove("fx-wiggle");
      void frame.offsetWidth; // force a reflow so re-adding the class below restarts the animation

      frame.style.setProperty("--wig-x", signed(WIG_X).toFixed(1) + "px");
      frame.style.setProperty("--wig-y", signed(WIG_Y).toFixed(1) + "px");
      frame.style.setProperty("--wig-rot", signed(WIG_ROT).toFixed(1) + "deg");
      frame.style.setProperty("--wig-pop", Math.random() < POP_CHANCE ? rand(POP_AMT).toFixed(2) : "0");
      frame.style.animationDelay = Math.round(Math.random() * DELAY_MAX_MS) + "ms";
      frame.style.animationDuration = Math.round(rand(DURATION_MS)) + "ms";

      frame.addEventListener("animationend", () => frame.classList.remove("fx-wiggle"), { once: true });
      frame.classList.add("fx-wiggle");
    });
  }

  window.SymbolFX = window.SymbolFX || {};
  window.SymbolFX.earthquake = triggerWiggle;
})();
