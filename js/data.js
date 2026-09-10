/* ------------------------------------------------------------------
   data.js
   Builds the camera-roll list from the real files in /images, with
   placeholder metadata and folder/collection assignments layered on
   top (until real captions/dates/etc. replace them).

   The rest of the app only depends on the shape of APP_DATA below —
   swap in more files or real metadata without touching app.js.
------------------------------------------------------------------- */

(function () {

  // Seeded RNG so the *data* (placeholder metadata, which photo lives
  // in which collection) is stable across reloads — only the wander
  // layout re-randomizes on shuffle.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20256);
  const rand = (min, max) => min + rng() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (p) => rng() < p;

  // The actual photos, dropped into /images.
  const FILES = [
    "IMG_2682.JPG", "IMG_2793.JPG", "IMG_2988.jpeg", "IMG_3026.jpg",
    "IMG_3027.jpg", "IMG_3197.JPG", "IMG_3203.jpg", "IMG_3550.JPG",
    "IMG_6717.jpg", "Tezza-2898.JPG", "Tezza-2931.JPG", "Tezza-5352.JPG",
    "Tezza-8579.JPG", "cosmos_1411513056.jpeg", "cosmos_1549046018.jpeg",
    "cosmos_457780706.jpeg", "cosmos_988344146.jpeg",
  ];

  // Internal tags — placeholder, used to drive the association logic
  // in the isolation view (not shown directly as metadata).
  const MOODS = ["quiet", "giddy", "tired", "cozy", "overstimulated", "nostalgic", "curious", "bored", "proud", "calm"];
  const SUBJECTS = ["hands", "sky", "food", "street", "plant", "screen", "pet", "reflection", "crowd", "object", "water", "light", "text", "shadow", "self", "sign"];
  const TEXTURES = ["grainy", "smooth", "blurry", "sharp", "warm", "cool", "dark", "bright", "soft", "harsh"];

  // Displayed metadata vocab — all placeholder for now.
  const SOURCES = ["iPhone 13", "iPhone 15", "screenshot", "downloaded", "sent by a friend", "scanned print", "old phone, recovered", "borrowed camera", "group chat"];
  const LOCATIONS = ["kitchen counter", "train, somewhere", "4:02am", "friend's couch", "waiting room", "unknown", "the walk home", "backseat", "windowsill", "half asleep", "before the show", "after the rain", "not sure, honestly", "second floor"];
  const KEPT_BECAUSE = ["the color", "the light", "didn't want to lose it", "reminded me of something", "no reason", "the composition, maybe", "a feeling", "in case I forgot", "it felt important then", "still not sure", "the way it was framed", "a joke only I remember"];
  const CONNECTIONS = ["a color I keep noticing", "the same kind of light", "an object I can't place", "a shape that repeats", "someone else's hands", "a feeling more than a subject", "the same time of day", "an old habit", "something almost familiar", "a texture, not a subject", "no clear reason", "a detail I followed"];
  const STILL_LIKE_IT = ["yes", "not really", "unsure", "more than before", "less than before", "yes, more than I expected"];

  const COLLECTIONS = [
    { id: "made-me-stop", name: "Made Me Stop", blurb: "something interrupted your attention enough to capture/save it" },
    { id: "look-again", name: "Look Again", blurb: "something became more interesting through repeated looking" },
    { id: "keep-this", name: "I Had to Keep This", blurb: "an impulse to preserve something without necessarily knowing why" },
    { id: "one-thing", name: "One Thing Led to Another", blurb: "an image that came from following an association, reference, detail, or curiosity" },
    { id: "keep-looking", name: "Keep Looking", blurb: "images that reward closer or longer attention" },
    { id: "again", name: "Again", blurb: "things you repeatedly returned to, noticed, saved, or recreated" },
    { id: "why-like-this", name: "Why Do I Like This?", blurb: "things whose appeal is difficult to rationalize" },
  ];

  const images = FILES.map((file, i) => {
    const sizeRoll = rng();
    const sizeBucket = sizeRoll < 0.32 ? "small" : sizeRoll < 0.72 ? "medium" : "large";
    // Target long edge for the card — actual w/h get filled in once the
    // real image dimensions are known (see app.js preloadDimensions()).
    const baseLong = sizeBucket === "small" ? randInt(130, 170) : sizeBucket === "medium" ? randInt(180, 240) : randInt(250, 330);

    const daysAgo = Math.round(Math.pow(rng(), 1.6) * 720);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const hour = randInt(0, 23);
    date.setHours(hour, randInt(0, 59), 0, 0);

    const returnedToCount = Math.floor(Math.pow(rng(), 2) * 11);
    const returnedTo = returnedToCount === 0 ? "not yet" : returnedToCount === 1 ? "once" : `${returnedToCount} times`;

    return {
      id: "img-" + i,
      index: i,
      file,
      code: "IMG_" + String(1000 + randInt(0, 8999)),

      // internal placeholder tags (association logic + collections only)
      hue: randInt(0, 359),
      mood: pick(MOODS),
      subject: pick(SUBJECTS),
      texture: pick(TEXTURES),

      baseLong, sizeBucket,
      w: baseLong, h: baseLong, // provisional square box until real dimensions load

      // displayed metadata (placeholder)
      type: chance(0.6) ? "primary" : "secondary",
      keptBecause: pick(KEPT_BECAUSE),
      source: pick(SOURCES),
      location: pick(LOCATIONS),
      dateLabel: formatDate(date),
      date,
      returnedTo, returnedToCount,
      connection: pick(CONNECTIONS),
      stillLikeIt: pick(STILL_LIKE_IT),

      isColorful: chance(0.3),
      significance: rng(),
      collections: [],
    };
  });

  // Assign collection membership based on loose tag rules, so filters
  // feel like they're grouping *real* qualities rather than being
  // arbitrary.
  images.forEach((img) => {
    const cols = new Set();

    if (img.mood === "proud" || img.mood === "giddy" || img.mood === "curious") {
      if (chance(0.45)) cols.add("made-me-stop");
    }
    if (["light", "reflection", "shadow", "water"].includes(img.subject) && chance(0.4)) {
      cols.add("look-again");
    }
    if (chance(0.28)) cols.add("keep-this");
    if (img.subject === "sign" || img.subject === "text" || img.subject === "screen") {
      if (chance(0.5)) cols.add("one-thing");
    }
    if (["object", "shadow", "plant"].includes(img.subject) || img.texture === "sharp" || img.texture === "soft") {
      if (chance(0.35)) cols.add("keep-looking");
    }
    if (img.returnedToCount >= 5) cols.add("again");
    if (img.isColorful || img.mood === "bored" || img.mood === "tired") {
      if (chance(0.3)) cols.add("why-like-this");
    }
    if (cols.size === 0) cols.add(pick(COLLECTIONS).id);

    // keep it to at most 3 collections so composition stays legible
    img.collections = Array.from(cols).slice(0, 3);
  });

  function formatDate(d) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  window.APP_DATA = { images, collections: COLLECTIONS };
})();
