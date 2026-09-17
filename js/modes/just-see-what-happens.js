/* ------------------------------------------------------------------
   modes/just-see-what-happens.js
   "JUST SEE WHAT HAPPENS" — architecture stub, no behavior yet.

   Registers with ModeManager so its symbol already switches cleanly.
   Build the actual interaction inside enter()/exit(): add listeners
   with ctx.on(...), temporary DOM with ctx.addTempNode(...), a running
   effect with ctx.loop(...)/ctx.interval(...) — all of it is undone
   automatically the moment another symbol is chosen. Keep this mode's
   own state on ctx.scratch, and read the archive only through
   ctx.archive (ctx.archive.getImages() is the permanent photo data —
   never mutate it from here).
------------------------------------------------------------------- */
(function () {
  ModeManager.register("just-see-what-happens", {
    label: "JUST SEE WHAT HAPPENS",

    enter(ctx) {
      // TODO: build this mode's interaction here.
    },

    exit(ctx) {
      // TODO: anything beyond what ctx's auto-cleanup already undoes.
    },
  });
})();
