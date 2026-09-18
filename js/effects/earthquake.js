/* ------------------------------------------------------------------
   effects/earthquake.js
   symbols/1.svg — an instant trigger, not a mode: clicking it makes
   every currently-visible photo do its own small, playful wiggle —
   a slightly randomized shimmy in position/rotation, with a minority
   of cards also popping up in scale as if sparkling — and let go again
   on its own. See js/modes-config.js (SYMBOL_FX_CONFIG) for how a
   symbol gets wired to this. (The export stays window.SymbolFX.
   earthquake — only the motion changed, not the wiring.)

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

   Each card's keyframe (cardWiggle in style.css) both starts and ends
   at the identity transform, so nothing needs to be cleaned up beyond
   removing the class again once the animation finishes — handled here
   via a one-off "animationend" listener per card.
------------------------------------------------------------------- */
(function () {
  const WIG_X = [4, 9]; // px, per-card horizontal wiggle amplitude range
  const WIG_Y = [4, 9]; // px, per-card vertical wiggle amplitude range
  const WIG_ROT = [4, 10]; // deg, per-card rotation amplitude range
  const POP_CHANCE = 0.22; // fraction of cards that also get a scale "pop"
  const POP_AMT = [0.10, 0.22]; // extra scale magnitude for popping cards
  const DELAY_MAX_MS = 140; // random per-card start offset, so the dance staggers rather than firing in lockstep
  const DURATION_MS = [520, 820]; // per-card animation duration range

  function rand([lo, hi]) { return lo + Math.random() * (hi - lo); }
  function signed(range) { return (Math.random() < 0.5 ? -1 : 1) * rand(range); }

  function triggerWiggle(archive) {
    const cards = archive && archive.getCards && archive.getCards();
    if (!cards || !cards.length) return;

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
