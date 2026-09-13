/* ------------------------------------------------------------------
   data.js
   Builds the camera-roll list from the real files in /images.

   Image loading, collection membership/numbering, and the scattered
   layout sizing are unchanged from before. This file was restructured
   only so that per-photo metadata and collection/library cover images
   are plain, manually editable data instead of randomly generated —
   nothing else about how images load or collections work has changed.

   HOW TO EDIT:
   - Metadata for each photo lives in IMAGE_METADATA below, keyed by
     its filename (must match an entry in FILES). Every field is a
     plain string — caption, source, location, date, keptBecause,
     returnedTo, connection. Edit freely; leave "" for anything not
     filled in yet (the app just skips blank fields).
   - Each collection's sidebar thumbnail is set via `cover` on that
     collection's entry in COLLECTIONS — a filename from FILES, or ""
     to fall back to the first photo in that collection.
   - The Library thumbnail (the top nav item) is set via LIBRARY_COVER
     below — a filename from FILES, or "" to fall back to the first
     photo overall.
------------------------------------------------------------------- */

(function () {

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

  // ---- collections: curated placement + manual cover image ----
  // Set `cover` to a filename from FILES to pin that collection's
  // sidebar thumbnail; leave "" to fall back to the first photo found
  // in the collection (the previous automatic behavior).
  const COLLECTIONS = [
    { id: "just-see", name: "JUST SEE WHAT HAPPENS [EXPERIMENTATION]", cover: "" },
    { id: "make-into", name: "MAKE IT INTO SOMETHING ELSE [IMAGINATION]", cover: "" },
    { id: "no-point", name: "NO POINT [?]", cover: "" },
    { id: "play-rules", name: "PLAY WITH THE RULES [BENDING SYSTEMS]", cover: "" },
    { id: "lose-track", name: "LOSE TRACK OF TIME [ABSORPTION]", cover: "" },
    { id: "play-together", name: "PLAY TOGETHER [SOCIAL PLAY]", cover: "" },
    { id: "what-else", name: "WHAT ELSE COULD IT BE? [POSSIBILITY]", cover: "" },
  ];

  // Cover image for the main "Library" nav item (the "all photos"
  // thumbnail). A filename from FILES, or "" to fall back to the
  // first photo overall.
  const LIBRARY_COVER = "";

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

  // Seeded RNG — used ONLY for the scattered card sizing below (which
  // photo is drawn "small/medium/large" and its target long edge).
  // It has nothing to do with metadata anymore; metadata is all in
  // IMAGE_METADATA and is never randomized.
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

  // =====================================================================
  // MANUALLY EDITED METADATA — one plain object per image, keyed by its
  // filename. Edit these directly; nothing is generated or randomized.
  // =====================================================================
  const IMAGE_METADATA = {
    "IMG_01.jpeg": {
      code: "IMG_1285",
      caption: "",
      source: "old phone, recovered",
      location: "not sure, honestly",
      date: "2026-09-12",
      keptBecause: "a feeling",
      returnedTo: "not yet",
      connection: "a shape that repeats",
    },
    "IMG_017.jpeg": {
      code: "IMG_1011",
      caption: "",
      source: "iPhone 15",
      location: "half asleep",
      date: "2026-09-08",
      keptBecause: "didn't want to lose it",
      returnedTo: "once",
      connection: "a color I keep noticing",
    },
    "IMG_018.jpeg": {
      code: "IMG_3936",
      caption: "",
      source: "scanned print",
      location: "backseat",
      date: "2026-09-04",
      keptBecause: "no reason",
      returnedTo: "once",
      connection: "a feeling more than a subject",
    },
    "IMG_02.jpeg": {
      code: "IMG_9518",
      caption: "",
      source: "group chat",
      location: "second floor",
      date: "2025-01-08",
      keptBecause: "the color",
      returnedTo: "4 times",
      connection: "a shape that repeats",
    },
    "IMG_03.jpeg": {
      code: "IMG_1670",
      caption: "",
      source: "borrowed camera",
      location: "before the show",
      date: "2025-07-23",
      keptBecause: "the way it was framed",
      returnedTo: "once",
      connection: "something almost familiar",
    },
    "IMG_04.jpeg": {
      code: "IMG_9233",
      caption: "",
      source: "borrowed camera",
      location: "waiting room",
      date: "2026-08-12",
      keptBecause: "didn't want to lose it",
      returnedTo: "4 times",
      connection: "the same time of day",
    },
    "IMG_05.jpeg": {
      code: "IMG_1880",
      caption: "",
      source: "iPhone 13",
      location: "waiting room",
      date: "2025-10-19",
      keptBecause: "no reason",
      returnedTo: "8 times",
      connection: "an old habit",
    },
    "IMG_06.jpeg": {
      code: "IMG_4771",
      caption: "",
      source: "sent by a friend",
      location: "second floor",
      date: "2025-07-30",
      keptBecause: "the color",
      returnedTo: "once",
      connection: "a detail I followed",
    },
    "IMG_07.jpeg": {
      code: "IMG_7671",
      caption: "",
      source: "iPhone 15",
      location: "train, somewhere",
      date: "2024-11-14",
      keptBecause: "reminded me of something",
      returnedTo: "not yet",
      connection: "an object I can't place",
    },
    "IMG_08.jpeg": {
      code: "IMG_1024",
      caption: "",
      source: "old phone, recovered",
      location: "before the show",
      date: "2026-04-25",
      keptBecause: "the light",
      returnedTo: "2 times",
      connection: "the same time of day",
    },
    "IMG_09.jpeg": {
      code: "IMG_5772",
      caption: "",
      source: "sent by a friend",
      location: "backseat",
      date: "2026-06-30",
      keptBecause: "the composition, maybe",
      returnedTo: "once",
      connection: "an object I can't place",
    },
    "IMG_10.jpeg": {
      code: "IMG_4083",
      caption: "",
      source: "group chat",
      location: "backseat",
      date: "2026-06-04",
      keptBecause: "no reason",
      returnedTo: "3 times",
      connection: "a texture, not a subject",
    },
    "IMG_11.jpeg": {
      code: "IMG_2993",
      caption: "",
      source: "screenshot",
      location: "4:02am",
      date: "2026-09-05",
      keptBecause: "still not sure",
      returnedTo: "9 times",
      connection: "a color I keep noticing",
    },
    "IMG_12.jpeg": {
      code: "IMG_4328",
      caption: "",
      source: "downloaded",
      location: "train, somewhere",
      date: "2026-09-13",
      keptBecause: "the light",
      returnedTo: "10 times",
      connection: "a color I keep noticing",
    },
    "IMG_13.jpeg": {
      code: "IMG_6655",
      caption: "",
      source: "iPhone 15",
      location: "waiting room",
      date: "2026-09-05",
      keptBecause: "no reason",
      returnedTo: "7 times",
      connection: "a texture, not a subject",
    },
    "IMG_14.jpeg": {
      code: "IMG_2383",
      caption: "",
      source: "iPhone 15",
      location: "half asleep",
      date: "2026-08-16",
      keptBecause: "still not sure",
      returnedTo: "not yet",
      connection: "a texture, not a subject",
    },
    "IMG_15.jpeg": {
      code: "IMG_5043",
      caption: "",
      source: "sent by a friend",
      location: "unknown",
      date: "2025-11-02",
      keptBecause: "reminded me of something",
      returnedTo: "5 times",
      connection: "the same time of day",
    },
    "IMG_16.jpeg": {
      code: "IMG_5071",
      caption: "",
      source: "downloaded",
      location: "half asleep",
      date: "2026-09-02",
      keptBecause: "the way it was framed",
      returnedTo: "8 times",
      connection: "no clear reason",
    },
    "IMG_19.jpeg": {
      code: "IMG_2885",
      caption: "",
      source: "downloaded",
      location: "the walk home",
      date: "2026-05-24",
      keptBecause: "a feeling",
      returnedTo: "not yet",
      connection: "a feeling more than a subject",
    },
    "IMG_20.jpeg": {
      code: "IMG_1858",
      caption: "",
      source: "downloaded",
      location: "waiting room",
      date: "2024-10-05",
      keptBecause: "it felt important then",
      returnedTo: "4 times",
      connection: "an old habit",
    },
    "IMG_21.jpeg": {
      code: "IMG_1735",
      caption: "",
      source: "group chat",
      location: "before the show",
      date: "2025-02-10",
      keptBecause: "reminded me of something",
      returnedTo: "2 times",
      connection: "a feeling more than a subject",
    },
    "IMG_22.jpeg": {
      code: "IMG_9405",
      caption: "",
      source: "iPhone 15",
      location: "not sure, honestly",
      date: "2024-12-01",
      keptBecause: "a feeling",
      returnedTo: "7 times",
      connection: "a texture, not a subject",
    },
    "IMG_23.jpeg": {
      code: "IMG_8205",
      caption: "",
      source: "sent by a friend",
      location: "unknown",
      date: "2026-09-13",
      keptBecause: "no reason",
      returnedTo: "not yet",
      connection: "a feeling more than a subject",
    },
    "IMG_24.jpeg": {
      code: "IMG_6002",
      caption: "",
      source: "scanned print",
      location: "waiting room",
      date: "2026-01-18",
      keptBecause: "the color",
      returnedTo: "not yet",
      connection: "someone else's hands",
    },
    "IMG_25.jpeg": {
      code: "IMG_7982",
      caption: "",
      source: "sent by a friend",
      location: "train, somewhere",
      date: "2026-07-18",
      keptBecause: "a joke only I remember",
      returnedTo: "not yet",
      connection: "the same kind of light",
    },
    "IMG_26.jpeg": {
      code: "IMG_2511",
      caption: "",
      source: "screenshot",
      location: "unknown",
      date: "2026-05-23",
      keptBecause: "in case I forgot",
      returnedTo: "not yet",
      connection: "the same kind of light",
    },
    "IMG_27.jpeg": {
      code: "IMG_8518",
      caption: "",
      source: "sent by a friend",
      location: "before the show",
      date: "2026-05-05",
      keptBecause: "reminded me of something",
      returnedTo: "6 times",
      connection: "a feeling more than a subject",
    },
    "IMG_28.jpeg": {
      code: "IMG_3712",
      caption: "",
      source: "iPhone 13",
      location: "waiting room",
      date: "2026-02-20",
      keptBecause: "didn't want to lose it",
      returnedTo: "not yet",
      connection: "a feeling more than a subject",
    },
    "IMG_29.jpeg": {
      code: "IMG_7946",
      caption: "",
      source: "sent by a friend",
      location: "the walk home",
      date: "2025-07-28",
      keptBecause: "didn't want to lose it",
      returnedTo: "6 times",
      connection: "the same kind of light",
    },
    "IMG_30.jpeg": {
      code: "IMG_3640",
      caption: "",
      source: "iPhone 13",
      location: "4:02am",
      date: "2026-03-02",
      keptBecause: "in case I forgot",
      returnedTo: "3 times",
      connection: "someone else's hands",
    },
    "IMG_31.jpeg": {
      code: "IMG_6909",
      caption: "",
      source: "sent by a friend",
      location: "kitchen counter",
      date: "2026-06-05",
      keptBecause: "a feeling",
      returnedTo: "once",
      connection: "a detail I followed",
    },
    "IMG_32.jpeg": {
      code: "IMG_3397",
      caption: "",
      source: "iPhone 13",
      location: "second floor",
      date: "2026-07-23",
      keptBecause: "in case I forgot",
      returnedTo: "once",
      connection: "a detail I followed",
    },
    "IMG_33.jpeg": {
      code: "IMG_6179",
      caption: "",
      source: "old phone, recovered",
      location: "half asleep",
      date: "2025-04-27",
      keptBecause: "it felt important then",
      returnedTo: "not yet",
      connection: "a texture, not a subject",
    },
    "IMG_34.jpeg": {
      code: "IMG_7741",
      caption: "",
      source: "screenshot",
      location: "4:02am",
      date: "2025-02-25",
      keptBecause: "a joke only I remember",
      returnedTo: "2 times",
      connection: "no clear reason",
    },
    "IMG_35.jpeg": {
      code: "IMG_7389",
      caption: "",
      source: "screenshot",
      location: "waiting room",
      date: "2026-05-02",
      keptBecause: "a joke only I remember",
      returnedTo: "3 times",
      connection: "no clear reason",
    },
    "IMG_36.jpeg": {
      code: "IMG_4104",
      caption: "",
      source: "borrowed camera",
      location: "4:02am",
      date: "2026-07-28",
      keptBecause: "a feeling",
      returnedTo: "not yet",
      connection: "a detail I followed",
    },
    "IMG_37.jpeg": {
      code: "IMG_7306",
      caption: "",
      source: "sent by a friend",
      location: "train, somewhere",
      date: "2026-05-02",
      keptBecause: "in case I forgot",
      returnedTo: "3 times",
      connection: "the same time of day",
    },
    "IMG_38.jpeg": {
      code: "IMG_9259",
      caption: "",
      source: "scanned print",
      location: "4:02am",
      date: "2025-07-30",
      keptBecause: "a joke only I remember",
      returnedTo: "not yet",
      connection: "an object I can't place",
    },
    "IMG_39.jpeg": {
      code: "IMG_5995",
      caption: "",
      source: "old phone, recovered",
      location: "windowsill",
      date: "2026-09-11",
      keptBecause: "a joke only I remember",
      returnedTo: "2 times",
      connection: "a detail I followed",
    },
    "IMG_40.jpeg": {
      code: "IMG_8521",
      caption: "",
      source: "iPhone 15",
      location: "half asleep",
      date: "2026-02-26",
      keptBecause: "it felt important then",
      returnedTo: "not yet",
      connection: "no clear reason",
    },
    "IMG_41.jpeg": {
      code: "IMG_1086",
      caption: "",
      source: "sent by a friend",
      location: "windowsill",
      date: "2026-05-26",
      keptBecause: "didn't want to lose it",
      returnedTo: "3 times",
      connection: "the same time of day",
    },
    "IMG_42.jpeg": {
      code: "IMG_3230",
      caption: "",
      source: "borrowed camera",
      location: "windowsill",
      date: "2024-11-03",
      keptBecause: "the way it was framed",
      returnedTo: "5 times",
      connection: "a detail I followed",
    },
    "IMG_43.jpeg": {
      code: "IMG_7263",
      caption: "",
      source: "iPhone 15",
      location: "before the show",
      date: "2026-06-29",
      keptBecause: "a feeling",
      returnedTo: "3 times",
      connection: "an object I can't place",
    },
    "IMG_44.jpeg": {
      code: "IMG_4569",
      caption: "",
      source: "borrowed camera",
      location: "train, somewhere",
      date: "2025-01-28",
      keptBecause: "a feeling",
      returnedTo: "6 times",
      connection: "something almost familiar",
    },
    "IMG_45.jpeg": {
      code: "IMG_5810",
      caption: "",
      source: "borrowed camera",
      location: "half asleep",
      date: "2025-03-01",
      keptBecause: "it felt important then",
      returnedTo: "4 times",
      connection: "no clear reason",
    },
    "IMG_46.jpeg": {
      code: "IMG_9268",
      caption: "",
      source: "downloaded",
      location: "waiting room",
      date: "2026-05-31",
      keptBecause: "it felt important then",
      returnedTo: "4 times",
      connection: "an old habit",
    },
    "IMG_47.jpeg": {
      code: "IMG_9065",
      caption: "",
      source: "group chat",
      location: "before the show",
      date: "2025-12-06",
      keptBecause: "it felt important then",
      returnedTo: "not yet",
      connection: "a shape that repeats",
    },
    "IMG_48.jpeg": {
      code: "IMG_1418",
      caption: "",
      source: "iPhone 15",
      location: "not sure, honestly",
      date: "2026-01-09",
      keptBecause: "a feeling",
      returnedTo: "2 times",
      connection: "the same kind of light",
    },
    "IMG_49.jpeg": {
      code: "IMG_9980",
      caption: "",
      source: "group chat",
      location: "train, somewhere",
      date: "2025-11-23",
      keptBecause: "no reason",
      returnedTo: "once",
      connection: "an object I can't place",
    },
    "IMG_50.jpeg": {
      code: "IMG_3893",
      caption: "",
      source: "sent by a friend",
      location: "second floor",
      date: "2025-07-03",
      keptBecause: "the color",
      returnedTo: "not yet",
      connection: "a detail I followed",
    },
    "IMG_51.jpeg": {
      code: "IMG_2046",
      caption: "",
      source: "downloaded",
      location: "kitchen counter",
      date: "2026-07-22",
      keptBecause: "no reason",
      returnedTo: "not yet",
      connection: "an object I can't place",
    },
    "IMG_52.jpeg": {
      code: "IMG_4952",
      caption: "",
      source: "borrowed camera",
      location: "half asleep",
      date: "2025-04-03",
      keptBecause: "still not sure",
      returnedTo: "not yet",
      connection: "a texture, not a subject",
    },
    "IMG_53.jpeg": {
      code: "IMG_1359",
      caption: "",
      source: "group chat",
      location: "half asleep",
      date: "2026-04-21",
      keptBecause: "in case I forgot",
      returnedTo: "once",
      connection: "no clear reason",
    },
    "IMG_54.jpeg": {
      code: "IMG_4800",
      caption: "",
      source: "iPhone 15",
      location: "second floor",
      date: "2026-01-27",
      keptBecause: "in case I forgot",
      returnedTo: "9 times",
      connection: "a texture, not a subject",
    },
    "IMG_55.jpeg": {
      code: "IMG_4020",
      caption: "",
      source: "iPhone 15",
      location: "waiting room",
      date: "2026-04-11",
      keptBecause: "no reason",
      returnedTo: "not yet",
      connection: "a color I keep noticing",
    },
    "IMG_56.jpeg": {
      code: "IMG_1496",
      caption: "",
      source: "borrowed camera",
      location: "windowsill",
      date: "2025-12-16",
      keptBecause: "in case I forgot",
      returnedTo: "not yet",
      connection: "a detail I followed",
    },
    "IMG_57.jpeg": {
      code: "IMG_2435",
      caption: "",
      source: "borrowed camera",
      location: "train, somewhere",
      date: "2025-07-31",
      keptBecause: "it felt important then",
      returnedTo: "once",
      connection: "a shape that repeats",
    },
    "IMG_58.jpeg": {
      code: "IMG_4656",
      caption: "",
      source: "scanned print",
      location: "4:02am",
      date: "2025-07-30",
      keptBecause: "it felt important then",
      returnedTo: "7 times",
      connection: "no clear reason",
    },
    "IMG_59.jpeg": {
      code: "IMG_6413",
      caption: "",
      source: "iPhone 15",
      location: "4:02am",
      date: "2026-04-28",
      keptBecause: "it felt important then",
      returnedTo: "8 times",
      connection: "the same kind of light",
    },
    "IMG_60.jpeg": {
      code: "IMG_3576",
      caption: "",
      source: "iPhone 15",
      location: "the walk home",
      date: "2026-09-13",
      keptBecause: "didn't want to lose it",
      returnedTo: "7 times",
      connection: "something almost familiar",
    },
    "IMG_61.jpeg": {
      code: "IMG_1614",
      caption: "",
      source: "downloaded",
      location: "after the rain",
      date: "2025-07-09",
      keptBecause: "the color",
      returnedTo: "once",
      connection: "an old habit",
    },
    "IMG_62.jpeg": {
      code: "IMG_2612",
      caption: "",
      source: "iPhone 13",
      location: "half asleep",
      date: "2026-09-11",
      keptBecause: "a feeling",
      returnedTo: "not yet",
      connection: "a color I keep noticing",
    },
    "IMG_63.jpeg": {
      code: "IMG_5441",
      caption: "",
      source: "old phone, recovered",
      location: "train, somewhere",
      date: "2026-08-29",
      keptBecause: "in case I forgot",
      returnedTo: "not yet",
      connection: "an old habit",
    },
    "IMG_64.jpeg": {
      code: "IMG_7039",
      caption: "",
      source: "sent by a friend",
      location: "waiting room",
      date: "2026-05-10",
      keptBecause: "the light",
      returnedTo: "not yet",
      connection: "the same time of day",
    },
    "IMG_65.jpeg": {
      code: "IMG_7574",
      caption: "",
      source: "borrowed camera",
      location: "backseat",
      date: "2026-09-05",
      keptBecause: "it felt important then",
      returnedTo: "5 times",
      connection: "a detail I followed",
    },
    "IMG_66.jpeg": {
      code: "IMG_5453",
      caption: "",
      source: "borrowed camera",
      location: "after the rain",
      date: "2026-06-06",
      keptBecause: "a joke only I remember",
      returnedTo: "2 times",
      connection: "a shape that repeats",
    },
    "IMG_67.jpeg": {
      code: "IMG_4120",
      caption: "",
      source: "borrowed camera",
      location: "half asleep",
      date: "2026-03-11",
      keptBecause: "still not sure",
      returnedTo: "8 times",
      connection: "someone else's hands",
    },
    "IMG_68.jpeg": {
      code: "IMG_2508",
      caption: "",
      source: "screenshot",
      location: "waiting room",
      date: "2025-06-27",
      keptBecause: "it felt important then",
      returnedTo: "5 times",
      connection: "the same kind of light",
    },
    "IMG_69.jpeg": {
      code: "IMG_1083",
      caption: "",
      source: "scanned print",
      location: "waiting room",
      date: "2024-10-02",
      keptBecause: "didn't want to lose it",
      returnedTo: "9 times",
      connection: "a shape that repeats",
    },
    "IMG_70.jpeg": {
      code: "IMG_2602",
      caption: "",
      source: "iPhone 15",
      location: "train, somewhere",
      date: "2024-11-26",
      keptBecause: "no reason",
      returnedTo: "7 times",
      connection: "a detail I followed",
    },
    "IMG_71.jpeg": {
      code: "IMG_4984",
      caption: "",
      source: "screenshot",
      location: "windowsill",
      date: "2025-12-21",
      keptBecause: "didn't want to lose it",
      returnedTo: "8 times",
      connection: "a feeling more than a subject",
    },
    "IMG_72.jpeg": {
      code: "IMG_2574",
      caption: "",
      source: "downloaded",
      location: "friend's couch",
      date: "2025-02-12",
      keptBecause: "reminded me of something",
      returnedTo: "6 times",
      connection: "a color I keep noticing",
    },
    "IMG_73.jpeg": {
      code: "IMG_6610",
      caption: "",
      source: "screenshot",
      location: "backseat",
      date: "2026-02-19",
      keptBecause: "the way it was framed",
      returnedTo: "4 times",
      connection: "something almost familiar",
    },
    "IMG_74.jpeg": {
      code: "IMG_6906",
      caption: "",
      source: "old phone, recovered",
      location: "4:02am",
      date: "2026-09-02",
      keptBecause: "the composition, maybe",
      returnedTo: "not yet",
      connection: "a feeling more than a subject",
    },
    "IMG_75.jpeg": {
      code: "IMG_2573",
      caption: "",
      source: "borrowed camera",
      location: "friend's couch",
      date: "2025-12-07",
      keptBecause: "it felt important then",
      returnedTo: "10 times",
      connection: "a feeling more than a subject",
    },
    "IMG_76.webp": {
      code: "IMG_6351",
      caption: "",
      source: "borrowed camera",
      location: "after the rain",
      date: "2026-06-09",
      keptBecause: "the way it was framed",
      returnedTo: "once",
      connection: "no clear reason",
    },
    "IMG_77.jpeg": {
      code: "IMG_1849",
      caption: "",
      source: "borrowed camera",
      location: "after the rain",
      date: "2025-12-08",
      keptBecause: "the composition, maybe",
      returnedTo: "2 times",
      connection: "a texture, not a subject",
    },
    "IMG_78.jpeg": {
      code: "IMG_7920",
      caption: "",
      source: "scanned print",
      location: "windowsill",
      date: "2026-08-17",
      keptBecause: "reminded me of something",
      returnedTo: "4 times",
      connection: "no clear reason",
    },
    "IMG_79.jpeg": {
      code: "IMG_1020",
      caption: "",
      source: "group chat",
      location: "friend's couch",
      date: "2025-10-25",
      keptBecause: "a feeling",
      returnedTo: "8 times",
      connection: "something almost familiar",
    },
    "IMG_80.jpeg": {
      code: "IMG_4915",
      caption: "",
      source: "old phone, recovered",
      location: "train, somewhere",
      date: "2026-08-09",
      keptBecause: "the composition, maybe",
      returnedTo: "not yet",
      connection: "a texture, not a subject",
    },
    "IMG_81.jpeg": {
      code: "IMG_9867",
      caption: "",
      source: "scanned print",
      location: "the walk home",
      date: "2025-01-25",
      keptBecause: "the way it was framed",
      returnedTo: "4 times",
      connection: "an old habit",
    },
    "IMG_82.jpeg": {
      code: "IMG_5406",
      caption: "",
      source: "group chat",
      location: "train, somewhere",
      date: "2025-11-16",
      keptBecause: "no reason",
      returnedTo: "10 times",
      connection: "an old habit",
    },
    "IMG_83.jpeg": {
      code: "IMG_9552",
      caption: "",
      source: "iPhone 13",
      location: "half asleep",
      date: "2026-01-18",
      keptBecause: "the color",
      returnedTo: "3 times",
      connection: "someone else's hands",
    },
    "IMG_84.jpeg": {
      code: "IMG_6615",
      caption: "",
      source: "iPhone 15",
      location: "the walk home",
      date: "2025-05-06",
      keptBecause: "didn't want to lose it",
      returnedTo: "once",
      connection: "a color I keep noticing",
    },
    "IMG_85.jpeg": {
      code: "IMG_7062",
      caption: "",
      source: "sent by a friend",
      location: "after the rain",
      date: "2026-04-26",
      keptBecause: "reminded me of something",
      returnedTo: "2 times",
      connection: "a detail I followed",
    },
  };

  const images = FILES.map((file, i) => {
    const num = numberFromFile(file);
    const meta = IMAGE_METADATA[file] || {};

    // Card size for the scattered layout — unrelated to metadata, kept
    // procedural (seeded, so it's stable across reloads; only "shuffle"
    // re-rolls the layout, not these buckets). Ranges kept modest so
    // photos — especially "large" ones — stay a reasonable size.
    const sizeRoll = rng();
    const sizeBucket = sizeRoll < 0.32 ? "small" : sizeRoll < 0.72 ? "medium" : "large";
    const baseLong = sizeBucket === "small" ? randInt(85, 112) : sizeBucket === "medium" ? randInt(118, 150) : randInt(158, 195);

    const parsedDate = meta.date ? new Date(meta.date) : null;
    const validDate = parsedDate && !isNaN(parsedDate) ? parsedDate : null;

    return {
      id: "img-" + i,
      index: i,
      file,
      code: meta.code || file,
      caption: meta.caption || "",

      // actual w/h get filled in once the real image dimensions are
      // known (see app.js preloadDimensions()).
      baseLong, sizeBucket,
      w: baseLong, h: baseLong, // provisional square box until real dimensions load

      // displayed metadata — all manually edited in IMAGE_METADATA above
      type: PRIMARY_NUMBERS.has(num) ? "primary" : SECONDARY_NUMBERS.has(num) ? "secondary" : "secondary",
      keptBecause: meta.keptBecause || "",
      source: meta.source || "",
      location: meta.location || "",
      dateLabel: validDate ? formatDate(validDate) : (meta.date || ""),
      date: validDate,
      returnedTo: meta.returnedTo || "",
      connection: meta.connection || "",

      collections: collectionsByNumber[num] || [],
    };
  });

  function formatDate(d) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  window.APP_DATA = { images, collections: COLLECTIONS, libraryCover: LIBRARY_COVER };
})();
