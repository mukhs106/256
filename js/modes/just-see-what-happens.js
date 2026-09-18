/* ------------------------------------------------------------------
   modes/just-see-what-happens.js
   "JUST SEE WHAT HAPPENS" — the archive's own image-to-image wandering
   path, exactly as it already exists: select a photo, the isolation
   view's flanking paths offer a small handful of loosely-related next
   images (same color, same mood, same subject, kept for a similar
   reason, around the same time — see defaultAssociations() in app.js),
   picking one continues the trail. Nothing about that needs building —
   it's already the archive's default way of connecting one photo to
   another — so this mode deliberately doesn't override
   ArchiveAPI.setAssociationStrategy the way NO POINT and WHAT ELSE
   COULD IT BE? do. Selecting this symbol just says "yes, this is the
   lens" without changing anything underneath it, which is the point:
   no intervention, see what happens.
------------------------------------------------------------------- */
(function () {
  ModeManager.register("just-see-what-happens", {
    label: "JUST SEE WHAT HAPPENS",

    enter(ctx) {
      // Intentionally no-op — see file header. The default,
      // already-loose association trail (restored by resetView() on
      // every mode switch) is exactly this mode's behavior.
    },

    exit(ctx) {
      // Nothing to undo.
    },
  });
})();
