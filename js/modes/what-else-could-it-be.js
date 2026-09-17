/* ------------------------------------------------------------------
   modes/what-else-could-it-be.js
   "WHAT ELSE COULD IT BE?" — architecture stub, no behavior yet.

   See modes/just-see-what-happens.js for the pattern: use ctx.on /
   addTempNode / addClass / loop / interval / timeout so ModeManager can
   tear everything down automatically on the next symbol switch, keep
   this mode's own state on ctx.scratch, and never mutate
   ctx.archive.getImages() (the permanent, shared photo data).
------------------------------------------------------------------- */
(function () {
  ModeManager.register("what-else-could-it-be", {
    label: "WHAT ELSE COULD IT BE?",

    enter(ctx) {
      // TODO: build this mode's interaction here.
    },

    exit(ctx) {
      // TODO: anything beyond what ctx's auto-cleanup already undoes.
    },
  });
})();
