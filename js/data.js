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
    "IMG_01.jpeg", "IMG_017.jpeg", "IMG_018.jpeg", "IMG_02.jpeg", "IMG_03.jpeg", "IMG_04.jpeg",
    "IMG_05.jpeg", "IMG_06.jpeg", "IMG_07.jpeg", "IMG_08.jpeg", "IMG_09.jpeg", "IMG_10.jpeg",
    "IMG_11.jpeg", "IMG_12.jpeg", "IMG_13.jpeg", "IMG_14.jpeg", "IMG_15.jpeg", "IMG_16.jpeg",
    "IMG_19.jpeg", "IMG_20.jpeg", "IMG_21.jpeg", "IMG_22.jpeg", "IMG_23.jpeg", "IMG_24.jpeg",
    "IMG_25.jpeg", "IMG_26.jpeg", "IMG_27.jpeg", "IMG_28.jpeg", "IMG_29.jpeg", "IMG_30.jpeg",
    "IMG_31.jpeg", "IMG_32.jpeg", "IMG_33.jpeg", "IMG_34.jpeg", "IMG_35.jpeg", "IMG_36.jpeg",
    "IMG_37.jpeg", "IMG_38.jpeg", "IMG_39.jpeg", "IMG_40.jpeg", "IMG_41.jpeg", "IMG_42.jpeg",
    "IMG_43.jpeg", "IMG_44.jpeg", "IMG_45.jpeg", "IMG_46.jpeg", "IMG_47.jpeg", "IMG_48.jpeg",
    "IMG_49.jpeg", "IMG_50.jpeg", "IMG_51.jpeg", "IMG_52.jpeg", "IMG_53.jpeg", "IMG_54.jpeg",
    "IMG_55.jpeg", "IMG_56.jpeg", "IMG_57.jpeg", "IMG_58.jpeg", "IMG_59.jpeg", "IMG_60.jpeg",
    "IMG_61.jpeg", "IMG_62.jpeg", "IMG_63.jpeg", "IMG_64.jpeg", "IMG_65.jpeg", "IMG_66.jpeg",
    "IMG_67.jpeg", "IMG_68.jpeg", "IMG_69.jpeg", "IMG_70.jpeg", "IMG_71.jpeg", "IMG_72.jpeg",
    "IMG_73.jpeg", "IMG_74.jpeg", "IMG_75.jpeg", "IMG_76.webp", "IMG_77.jpeg", "IMG_78.jpeg",
    "IMG_79.jpeg", "IMG_80.jpeg", "IMG_81.jpeg", "IMG_82.jpeg", "IMG_83.jpeg", "IMG_84.jpeg",
    "IMG_85.jpeg",
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

  const COLLECTIONS = [
    { id: "just-see", name: "Just See What Happens", tag: "experimentation" },
    { id: "make-into", name: "Make It Into Something Else", tag: "imagination" },
    { id: "no-point", name: "No Point", tag: "?" },
    { id: "play-rules", name: "Play With the Rules", tag: "bending systems" },
    { id: "lose-track", name: "Lose Track of Time", tag: "absorption" },
    { id: "play-together", name: "Play Together", tag: "social play" },
    { id: "what-else", name: "What Else Could It Be?", tag: "possibility" },
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

    if (img.texture === "grainy" || img.texture === "blurry" || img.texture === "harsh" || img.mood === "curious") {
      if (chance(0.4)) cols.add("just-see");
    }
    if (["object", "shadow", "reflection", "light"].includes(img.subject)) {
      if (chance(0.4)) cols.add("make-into");
    }
    if (chance(0.25)) cols.add("no-point");
    if (img.subject === "sign" || img.subject === "text" || img.subject === "screen" || img.type === "secondary") {
      if (chance(0.35)) cols.add("play-rules");
    }
    if (["quiet", "calm", "overstimulated"].includes(img.mood) || img.returnedToCount >= 4) {
      if (chance(0.4)) cols.add("lose-track");
    }
    if (["hands", "crowd", "pet", "self"].includes(img.subject)) {
      if (chance(0.45)) cols.add("play-together");
    }
    if (["water", "sky", "plant"].includes(img.subject) || img.texture === "soft" || img.texture === "bright") {
      if (chance(0.35)) cols.add("what-else");
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
