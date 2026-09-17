/* ------------------------------------------------------------------
   modes/lose-track-of-time.js
   "LOSE TRACK OF TIME" — architecture stub, no behavior yet.

   Flagged as one of the more involved modes (likely: some kind of
   continuous wandering/auto-scroll/absorption effect) — it gets built
   out independently, later, on top of the same hooks every other mode
   uses:
     - ctx.loop(fn) for a per-frame effect (e.g. slow auto-scroll or a
       drifting layout), or ctx.interval(fn, ms) for something coarser
       — both are cancelled automatically on exit.
     - ctx.archive.setAutoExtend(false/true) to pause/resume the
       archive's own scroll-triggered region generation if this mode
       wants to drive scrolling/growth itself instead.
     - ctx.scratch for this mode's own timing/position state; never
       write into ctx.archive.getImages() (the permanent, shared photo
       data).
   None of that is implemented yet — this file only registers the mode
   so its symbol already switches cleanly.
------------------------------------------------------------------- */
(function () {
  ModeManager.register("lose-track-of-time", {
    label: "LOSE TRACK OF TIME",

    enter(ctx) {
      // TODO: build this mode's interaction here.
    },

    exit(ctx) {
      // TODO: anything beyond what ctx's auto-cleanup already undoes.
    },
  });
})();
