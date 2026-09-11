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
    { id: "just-see", name: "JUST SEE WHAT HAPPENS [EXPERIMENTATION]" },
    { id: "make-into", name: "MAKE IT INTO SOMETHING ELSE [IMAGINATION]" },
    { id: "no-point", name: "NO POINT [?]" },
    { id: "play-rules", name: "PLAY WITH THE RULES [BENDING SYSTEMS]" },
    { id: "lose-track", name: "LOSE TRACK OF TIME [ABSORPTION]" },
    { id: "play-together", name: "PLAY TOGETHER [SOCIAL PLAY]" },
    { id: "what-else", name: "WHAT ELSE COULD IT BE? [POSSIBILITY]" },
  ];

  // ---- real curated data: which numbered photo goes where ----
  // Expands a spec like "1, 2, 22-29, 31-69" into [1, 2, 22, 23, ..., 69].
  function expand(spec) {
    const out = [];
    spec.split(",").forEach((part) => {
      part = part.trim();
      if (!part) return;
      if (part.includes("-")) {
        const [a, b] = part.split("-").map((n) => parseInt(n, 10));
        for (let n = a; n <= b; n++) out.push(n);
      } else {
        out.push(parseInt(part, 10));
      }
    });
    return out;
  }

  const PRIMARY_NUMBERS = new Set(expand("1, 2, 3, 6, 14, 17, 18, 22-29, 31-69, 73, 74, 78-80"));
  const SECONDARY_NUMBERS = new Set(expand("4, 5, 7-13, 15, 16, 19-21, 30, 70-72, 75-77, 81-84"));

  const CATEGORY_NUMBERS = {
    "just-see": expand("2, 7, 9, 11, 12, 15, 17, 18, 26, 30, 33, 35, 38, 43, 44, 50, 51, 58, 60, 61, 63, 67, 69"),
    "make-into": expand("3, 7, 8, 9, 15, 26, 48, 50, 53, 66, 69, 72, 76, 77, 83, 84"),
    "no-point": expand("4, 5, 7, 10, 12, 16, 20, 33, 34, 36, 39, 40, 52, 55, 59, 62, 65, 73, 79, 80"),
    "play-rules": expand("4, 8, 15, 30, 43, 51, 61, 63, 66, 69, 75, 76, 82, 83, 84"),
    "lose-track": expand("1, 3, 6, 18, 20, 22, 23, 24, 25, 27, 29, 31, 39, 40, 41, 44, 46, 54, 55, 57, 60, 65, 67, 80, 81"),
    "play-together": expand("1, 13, 14, 21, 24, 28, 32, 37, 40, 41, 42, 45, 46, 47, 48, 49, 52, 53, 56, 57, 62, 68, 70, 71, 74, 75, 78, 81, 83"),
    "what-else": expand("4, 7, 8, 10, 19, 26, 58, 61, 77"),
  };

  // filename -> its number (e.g. "IMG_017.jpeg" -> 17), so the specs
  // above (which use plain numbers) can be matched to real files.
  function numberFromFile(file) {
    const m = file.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  const collectionsByNumber = {};
  Object.entries(CATEGORY_NUMBERS).forEach(([colId, nums]) => {
    nums.forEach((n) => {
      (collectionsByNumber[n] = collectionsByNumber[n] || []).push(colId);
    });
  });

  const images = FILES.map((file, i) => {
    const num = numberFromFile(file);
    const sizeRoll = rng();
    const sizeBucket = sizeRoll < 0.32 ? "small" : sizeRoll < 0.72 ? "medium" : "large";
    // Target long edge for the card — actual w/h get filled in once the
    // real image dimensions are known (see app.js preloadDimensions()).
    const baseLong = sizeBucket === "small" ? randInt(110, 145) : sizeBucket === "medium" ? randInt(150, 200) : randInt(210, 275);

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

      // displayed metadata (placeholder — real captions/dates go here later)
      type: PRIMARY_NUMBERS.has(num) ? "primary" : SECONDARY_NUMBERS.has(num) ? "secondary" : "secondary",
      keptBecause: pick(KEPT_BECAUSE),
      source: pick(SOURCES),
      location: pick(LOCATIONS),
      dateLabel: formatDate(date),
      date,
      returnedTo, returnedToCount,
      connection: pick(CONNECTIONS),

      isColorful: chance(0.3),
      significance: rng(),
      collections: collectionsByNumber[num] || [],
    };
  });

  function formatDate(d) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  window.APP_DATA = { images, collections: COLLECTIONS };
})();
