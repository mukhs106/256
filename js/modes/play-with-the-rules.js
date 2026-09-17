/* ------------------------------------------------------------------
   modes/play-with-the-rules.js
   "PLAY WITH THE RULES" — architecture stub, no behavior yet.

   Flagged as one of the more involved modes (likely: letting the
   viewer drag/rearrange/break the layout's own rules) — it gets built
   out independently, later, on top of the same hooks every other mode
   uses:
     - ctx.on(target, type, handler) for drag/pointer listeners on
       cards from ctx.archive.getCards() — auto-removed on exit.
     - ctx.scratch for any per-activation state (e.g. dragged
       positions) — never write back into ctx.archive.getImages(),
       which is the permanent, shared photo data. Whatever this mode
       does to card positions is purely visual (inline style overrides
       on the DOM nodes) and disappears the moment ModeManager resets
       the view on the next symbol switch.
     - ctx.loop/interval/timeout for any animated or timed behavior.
   None of that is implemented yet — this file only registers the mode
   so its symbol already switches cleanly.
------------------------------------------------------------------- */
(function () {
  ModeManager.register("play-with-the-rules", {
    label: "PLAY WITH THE RULES",

    enter(ctx) {
      // TODO: build this mode's interaction here.
    },

    exit(ctx) {
      // TODO: anything beyond what ctx's auto-cleanup already undoes.
    },
  });
})();
