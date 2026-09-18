/* ------------------------------------------------------------------
   modes/drift.js
   "DRIFT" (symbols/6.svg) — while active, every photo independently
   wanders a few px around its normal spot, plus a very slight
   rotation, each on its own randomized timing so the field reads as
   loosely weightless rather than one synchronized animation.

   Each card's motion is a closed-form function of time (sin/cos with a
   per-card amplitude, period and phase), not something that needs
   easing toward a moving target the way MAGNET does — so the per-frame
   work is just evaluating that function for whichever cards are
   currently live, using positions/sizes already cached once here
   rather than reading the DOM every frame the way the pull calculation
   in magnet.js has to.
------------------------------------------------------------------- */
(function () {
  const AMP_XY = [4, 11]; // px, per-axis drift amplitude range
  const AMP_ROT = [0.6, 2.2]; // deg, rotation amplitude range
  const PERIOD_MS = [3500, 7500]; // ms, per-axis/rotation period range — kept independent per card so nothing lines up
  const CARD_RESCAN_MS = 1000; // how often the live card list is refreshed (scroll extends/prunes it)

  function rand([lo, hi]) { return lo + Math.random() * (hi - lo); }

  ModeManager.register("drift", {
    label: "DRIFT",

    enter(ctx) {
      const params = new Map(); // card el -> its own randomized amplitude/period/phase

      function assign(card) {
        if (params.has(card)) return;
        params.set(card, {
          ax: rand(AMP_XY), ay: rand(AMP_XY), arot: rand(AMP_ROT),
          px: rand(PERIOD_MS), py: rand(PERIOD_MS), prot: rand(PERIOD_MS),
          phx: Math.random() * Math.PI * 2,
          phy: Math.random() * Math.PI * 2,
          phrot: Math.random() * Math.PI * 2,
        });
      }

      let cards = ctx.archive.getCards();
      cards.forEach(assign);
      ctx.interval(() => {
        cards = ctx.archive.getCards();
        cards.forEach(assign); // existing cards keep their already-assigned motion; only new ones get fresh params
      }, CARD_RESCAN_MS);

      ctx.loop((t) => {
        cards.forEach((card) => {
          const p = params.get(card);
          if (!p) return;
          const x = Math.sin(t / p.px + p.phx) * p.ax;
          const y = Math.cos(t / p.py + p.phy) * p.ay;
          const rot = Math.sin(t / p.prot + p.phrot) * p.arot;
          card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
        });
      });
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: it cancels the rAF loop
      // and the rescan interval; archive.resetView()'s follow-up
      // rebuild returns every card to its plain, undrifted position.
    },
  });
})();
