/* ------------------------------------------------------------------
   butterfly-config.js
   ------------------------------------------------------------------
   Everything you'd want to tweak for the ButterflyNavigation feature
   lives in this one file. The engine (js/butterfly-navigation.js)
   reads window.ButterflyConfig and should not need to change when you
   adjust anything below.

   HOW TO FIND IMAGE IDs
   ----------------------
   Every photo card rendered by js/app.js already carries a stable
   `data-id` attribute (e.g. "img-0", "img-3", ...) — see makeCard() in
   js/app.js, which sets el.dataset.id = img.id. That id is just the
   image's position in the FILES list in js/data.js, 0-indexed. Open
   devtools and inspect a .photo-card element to confirm one, or count
   down the FILES array. This file doesn't invent new ids — it reuses
   the ones the page already has.
------------------------------------------------------------------- */

(function () {

  // The route the creature flies. It travels from `from` to `to` for
  // each entry in order, pauses briefly on arrival, then continues to
  // the next entry — looping back to the start once it reaches the
  // end (unless `loop` below is set to false).
  //
  // `from` on the very first entry is where the creature starts; after
  // that it always continues from wherever it last landed, so chain
  // these the way you'd draw a route on a map, e.g.:
  //   { from: "image-01", to: "image-07" },
  //   { from: "image-07", to: "image-14" },
  //   { from: "image-14", to: "image-03" },
  var connections = [
    { from: "img-0", to: "img-4" },
    { from: "img-4", to: "img-9" },
    { from: "img-9", to: "img-13" },
    { from: "img-13", to: "img-2" },
    { from: "img-2", to: "img-0" },
  ];

  window.ButterflyConfig = {
    // Turn the whole feature on/off without removing any files.
    enabled: true,

    // Which creature to render: "butterfly" or "bee".
    // (Styling for each lives in css/butterfly.css.)
    creature: "butterfly",

    // The route described above.
    connections: connections,

    // Flight speed, in pixels/second. Higher = faster.
    speed: 260,

    // Flight time is roughly distance/speed, clamped to this range so
    // very short or very long hops between images still feel
    // intentional rather than instant or sluggish.
    minFlightMs: 900,
    maxFlightMs: 3200,

    // How long the creature rests on an image before continuing, in ms.
    pauseMs: 1800,

    // How strongly the flight path bows away from a straight line
    // between two images. 0 = straight line, ~0.3-0.5 = gentle arc,
    // 1+ = pronounced swoop.
    curvature: 0.4,

    // Size of the creature, in px (applied as both width and height).
    size: 34,

    // Delay before the first flight, in ms — gives the page a moment
    // to finish its own initial render first.
    startDelayMs: 1200,

    // Stacking order (CSS z-index) of the creature's layer. Kept below
    // the isolation view (100) and metadata panel (2000) defined in
    // css/style.css so it can never cover them; the layer is also
    // hidden automatically while the isolation view is open.
    zIndex: 90,

    // If false, the creature makes one pass through `connections` and
    // then stays put instead of looping forever.
    loop: true,
  };

})();
