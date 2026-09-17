/* ------------------------------------------------------------------
   modes/what-else-could-it-be.js
   "WHAT ELSE COULD IT BE?" — the same isolation-view paths again, fed
   a couple of plausible-but-unexpected alternates instead of the
   archive's usual closest matches:
     1. another photo from a collection this one belongs to, if any —
        a real connection the default trail never surfaces, since
        defaultAssociations() in app.js only reasons about color/mood/
        subject/texture/date, not collections.
     2. the photo with the *farthest* hue in the whole archive — the
        deliberate opposite of the default trail's "same color" pick.
   Both are picked deterministically (seeded where there's a choice
   among ties, exact for the farthest-hue pick), so proposing "what
   else" for a given photo is stable rather than reshuffling itself
   every time it's opened.
------------------------------------------------------------------- */
(function () {
  const MAX_ALTS = 2;

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

  function hueDist(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function altAssociations(img, images) {
    const others = images.filter((i) => i.id !== img.id);
    const used = new Set();
    const picks = [];

    function take(candidate, label) {
      if (candidate && !used.has(candidate.id) && picks.length < MAX_ALTS) {
        used.add(candidate.id);
        picks.push({ label, image: candidate });
      }
    }

    if (img.collections && img.collections.length) {
      const shared = others.filter((i) => i.collections.some((c) => img.collections.includes(c)));
      if (shared.length) {
        const rng = mulberry32(hashSeed(img.id + "|collection"));
        take(shared[Math.floor(rng() * shared.length)], "could also belong here");
      }
    }

    let farthest = null, farthestDist = -1;
    for (const i of others) {
      const d = hueDist(i.hue, img.hue);
      if (d > farthestDist) { farthestDist = d; farthest = i; }
    }
    take(farthest, "read differently");

    // Fills any remaining slot (e.g. no shared collection) with a
    // deterministic, still-seeded pick rather than leaving it short.
    if (picks.length < MAX_ALTS && others.length > picks.length) {
      const rng = mulberry32(hashSeed(img.id + "|alt"));
      let guard = 0;
      while (picks.length < MAX_ALTS && guard++ < 200) {
        take(others[Math.floor(rng() * others.length)], "another way to see it");
      }
    }

    return picks;
  }

  ModeManager.register("what-else-could-it-be", {
    label: "WHAT ELSE COULD IT BE?",

    enter(ctx) {
      ctx.archive.setAssociationStrategy(altAssociations);
    },

    exit(ctx) {
      // Nothing beyond ctx's own auto-cleanup: ModeManager's follow-up
      // resetView() clears the association strategy on every switch.
    },
  });
})();
