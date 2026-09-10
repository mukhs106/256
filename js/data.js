/* ------------------------------------------------------------------
   data.js
   Generates a placeholder "camera roll" — 80-ish fake photos with
   generated colors instead of real image files, plus fake metadata
   and folder/collection assignments.

   Swap this file out (or feed it real data) once the real 256 images
   and categories are ready. The rest of the app only depends on the
   shape of APP_DATA below.
------------------------------------------------------------------- */

(function () {

  // Seeded RNG so the *data* (tags, dates, which photo lives in which
  // collection) is stable across reloads — only the wander layout
  // re-randomizes on shuffle.
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

  const MOODS = ["quiet", "giddy", "tired", "cozy", "overstimulated", "nostalgic", "curious", "bored", "proud", "calm"];
  const SUBJECTS = ["hands", "sky", "food", "street", "plant", "screen", "pet", "reflection", "crowd", "object", "water", "light", "text", "shadow", "self", "sign"];
  const TEXTURES = ["grainy", "smooth", "blurry", "sharp", "warm", "cool", "dark", "bright", "soft", "harsh"];
  const SOURCES = ["iPhone 13", "iPhone 15", "Screenshot", "Downloaded", "Sent by a friend", "Scanned print", "Old phone, recovered", "Borrowed camera", "Group chat"];
  const LOCATIONS = ["kitchen counter", "train, somewhere", "4:02am", "friend's couch", "waiting room", "unknown", "the walk home", "backseat", "windowsill", "half asleep", "before the show", "after the rain", "not sure, honestly", "second floor"];

  const COLLECTIONS = [
    { id: "stopped-me", name: "Stopped me in my tracks", blurb: "the ones worth the awkward pause to take out my phone", defaultView: "wander" },
    { id: "colors", name: "Colors I can't explain", blurb: "no reason, just the color", defaultView: "color" },
    { id: "screens", name: "Screens of screens", blurb: "a screenshot of a screenshot of a screen", defaultView: "optimize" },
    { id: "almost-deleted", name: "Almost deleted these", blurb: "blurry, sideways, still here somehow", defaultView: "wander" },
    { id: "textures", name: "Textures", blurb: "surfaces, mostly", defaultView: "wander" },
    { id: "late-night", name: "Late at night", blurb: "things that only made sense at the time", defaultView: "timeline" },
    { id: "no-reason", name: "For no reason", blurb: "no caption needed, no caption available", defaultView: "wander" },
  ];

  const TOTAL = 84;
  const images = [];

  for (let i = 0; i < TOTAL; i++) {
    const hue = randInt(0, 359);
    const hueShift = pick([18, 26, 34, -18, -26, -34, 44, -44]);
    const hue2 = (hue + hueShift + 360) % 360;
    const sat = randInt(35, 78);
    const light1 = randInt(38, 62);
    const light2 = randInt(30, 68);

    const sizeRoll = rng();
    const sizeBucket = sizeRoll < 0.32 ? "small" : sizeRoll < 0.72 ? "medium" : "large";
    const baseW = sizeBucket === "small" ? randInt(130, 165) : sizeBucket === "medium" ? randInt(175, 225) : randInt(235, 300);
    const aspect = pick([0.7, 0.8, 0.9, 1, 1, 1.1, 1.25, 1.4, 1.6]); // w/h — mostly portrait/square-ish, occasional landscape
    const w = baseW;
    const h = Math.round(baseW / aspect);

    // date: skew toward "recently", but spread across ~2 years
    const daysAgo = Math.round(Math.pow(rng(), 1.6) * 720);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const hour = randInt(0, 23);
    date.setHours(hour, randInt(0, 59), 0, 0);

    const mood = pick(MOODS);
    const subject = pick(SUBJECTS);
    const texture = pick(TEXTURES);
    const source = pick(SOURCES);
    const location = pick(LOCATIONS);

    const dimsW = pick([3024, 4032, 2048, 1170, 4096, 3000]);
    const dimsH = Math.round(dimsW * (h / w));

    const img = {
      id: "img-" + i,
      index: i,
      code: "IMG_" + String(1000 + randInt(0, 8999)),
      hue, hue2, sat, light1, light2,
      w, h, sizeBucket,
      mood, subject, texture, source, location,
      date, dateLabel: formatDate(date),
      dims: `${dimsW} × ${dimsH}`,
      isNightPhoto: hour >= 22 || hour <= 4,
      isScreen: subject === "screen" || subject === "text" || source === "Screenshot",
      isColorful: sat > 60 && chance(0.7),
      significance: rng(), // used to vary size in timeline view
      collections: [],
    };

    images.push(img);
  }

  // Assign collection membership based on loose tag rules, so filters
  // feel like they're grouping *real* qualities rather than being
  // arbitrary.
  images.forEach((img) => {
    const cols = new Set();

    if (img.isScreen) cols.add("screens");
    if (img.isNightPhoto) cols.add("late-night");
    if (img.isColorful) cols.add("colors");
    if (img.texture === "grainy" || img.texture === "blurry") {
      if (chance(0.55)) cols.add("almost-deleted");
    }
    if (["object", "shadow", "light", "reflection"].includes(img.subject) && chance(0.5)) {
      cols.add("textures");
    }
    if (img.mood === "proud" || img.mood === "giddy" || img.mood === "curious") {
      if (chance(0.4)) cols.add("stopped-me");
    }
    if (cols.size === 0 || chance(0.15)) cols.add("no-reason");

    // keep it to at most 3 collections so counts stay legible
    img.collections = Array.from(cols).slice(0, 3);
  });

  function formatDate(d) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  window.APP_DATA = { images, collections: COLLECTIONS };
})();
