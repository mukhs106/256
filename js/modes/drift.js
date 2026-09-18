/* ------------------------------------------------------------------
   modes/drift.js
   "DRIFT" (symbols/6.svg) — while active, every photo independently
   wanders a few px around its normal spot, plus a very slight
   rotation, each on its own randomized timing so the field reads as
   loosely weightless rather than one synchronized animation.

   Each axis is two sine waves of independent, randomized period added
   together (a slow primary sweep plus a smaller, faster secondary one)
   rather than one clean sine each — a single sine per axis is a
   perfectly repeating loop and reads as mechanical once you watch it
   for a few cycles; summing two off-period waves per card means the
   combined path only very loosely repeats, closer to how something
   adrift actually looks.

   This is still a closed-form function of time, not something that
   needs easing toward a moving target the way MAGNET does — so the
   per-frame work is just evaluating it for whichever cards are
   currently live, using positions/sizes already cached once here
   rather than reading the DOM every frame. The base .photo-card
   transition is turned off for the duration (see
   body[data-mode="drift"] in style.css) so this motion is exactly
   what's requested each frame, not smoothed a second time on top.
------------------------------------------------------------------- */
(function () {
  const AMP_XY = [4, 10]; // px, primary per-axis drift amplitude range
  const AMP_XY_2 = [1.5, 4]; // px, secondary (faster) harmonic amplitude range
  const AMP_ROT = [0.5, 2]; // deg, rotation amplitude range
  const PERIOD_MS = [4000, 8000]; // ms, primary per-axis/rotation period range
  const PERIOD_MS_2 = [1200, 2600]; // ms, secondary harmonic period range — off-ratio from the primary on purpose
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
          ax2: rand(AMP_XY_2), ay2: rand(AMP_XY_2),
          px: rand(PERIOD_MS), py: rand(PERIOD_MS), prot: rand(PERIOD_MS),
          px2: rand(PERIOD_MS_2), py2: rand(PERIOD_MS_2),
          phx: Math.random() * Math.PI * 2,
          phy: Math.random() * Math.PI * 2,
          phrot: Math.random() * Math.PI * 2,
          phx2: Math.random() * Math.PI * 2,
          phy2: Math.random() * Math.PI * 2,
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
          const x = Math.sin(t / p.px + p.phx) * p.ax + Math.sin(t / p.px2 + p.phx2) * p.ax2;
          const y = Math.cos(t / p.py + p.phy) * p.ay + Math.cos(t / p.py2 + p.phy2) * p.ay2;
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
