/* ------------------------------------------------------------------
   modes/no-point.js
   "NO POINT" — the same isolation-view paths as every other mode, just
   fed a deliberately pointless set of suggestions instead of the
   archive's usual loose associations. No hue/mood/subject/texture
   matching at all: each photo gets a small, fixed set of "next"
   photos picked by a seeded PRNG keyed to its own id, so the sequence
   from any given image is arbitrary but always the same arbitrary
   sequence — stable and reproducible, not visibly broken or freshly
   randomized on every click.
------------------------------------------------------------------- */
(function () {
  const PICK_COUNT = 3; // deliberately fewer than the default trail's up-to-6

  // Same small seeded-PRNG pattern data.js already uses for its own
  // internal (non-displayed) randomness — kept local here rather than
  // shared, since each mode file stays self-contained.
  function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Deterministic per starting image: the same photo always offers the
  // same arbitrary handful of "next" photos, no matter how many times
  // it's opened, since the PRNG is reseeded from its id each time
  // rather than carried over between calls.
  function noPointAssociations(img, images) {
    const pool = images.filter((i) => i.id !== img.id);
    const rng = mulberry32(hashSeed(img.id));
    const used = new Set();
    const picks = [];
    let guard = 0;
    while (picks.length < Math.min(PICK_COUNT, pool.length) && guard++ < 200) {
      const candidate = pool[Math.floor(rng() * pool.length)];
      if (!used.has(candidate.id)) { used.add(candidate.id); picks.push(candidate); }
    }
    // No "same color"/"same mood" style label — that would explain a
    // reason this deliberately doesn't have. The image's own name is
    // still exposed for accessibility, without justifying the pick.
    return picks.map((image) => ({ label: image.code, image }));
  }

  ModeManager.register("no-point", {
    label: "NO POINT",

    enter(ctx) {
      ctx.archive.setAssociationStrategy(noPointAssociations);
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: ModeManager's follow-up
      // resetView() clears the association strategy on every switch.
    },
  });
})();
