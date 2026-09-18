/* ------------------------------------------------------------------
   app.js
   Rendering + interaction for the camera-roll prototype.
   Depends on window.APP_DATA from data.js.
------------------------------------------------------------------- */

(function () {
  const { images } = window.APP_DATA;

  const state = {
    collectionId: "all",
    trail: [],
    isolatedId: null,
  };

  // ---------- helpers ----------

  function imgUrl(img) {
    return "images/" + img.file;
  }

  function hueDist(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function pickBest(list, scoreFn, higherIsBetter) {
    if (!list.length) return null;
    let best = list[0], bestScore = scoreFn(best);
    for (const it of list) {
      const s = scoreFn(it);
      if (higherIsBetter ? s > bestScore : s < bestScore) { best = it; bestScore = s; }
    }
    return best;
  }

  // state.collectionId stays "all" until the symbols are wired up to
  // filtering in a future pass — kept here (and in data.js) so that
  // work has something to plug into without touching this function.
  function filteredImages() {
    if (state.collectionId === "all") return images;
    return images.filter((i) => i.collections.includes(state.collectionId));
  }

  // ---------- preload real image dimensions ----------
  // The cards are absolutely positioned by the layout algorithm before
  // they're added to the page, so we need each photo's real aspect
  // ratio up front rather than letting the <img> load it lazily.

  function preloadDimensions() {
    return Promise.all(images.map((img) => new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => {
        const nw = probe.naturalWidth || 1;
        const nh = probe.naturalHeight || 1;
        if (nw >= nh) { img.w = img.baseLong; img.h = Math.round(img.baseLong * nh / nw); }
        else { img.h = img.baseLong; img.w = Math.round(img.baseLong * nw / nh); }
        resolve();
      };
      probe.onerror = resolve; // keep the provisional square box
      probe.src = imgUrl(img);
    })));
  }

  // Not called from anywhere yet (no UI sets a collection id besides
  // "all") — left in place for the symbol-driven filtering that will
  // replace the old sidebar's job.
  function selectCollection(id) {
    state.collectionId = id;
    resetField();
  }

  // ---------- mode switching (symbol nav -> ModeManager) ----------
  // Which symbol maps to which mode lives entirely in MODE_CONFIG
  // (js/modes-config.js) as symbol_1..symbol_6, in the same left-to-
  // right order as the .nav-symbol elements in index.html. This code
  // never hard-codes a mode id — it just looks up "symbol_" + (index+1)
  // and hands whatever it finds to ModeManager.

  function modeIdForSymbolIndex(i) {
    const key = "symbol_" + (i + 1);
    return (window.MODE_CONFIG && window.MODE_CONFIG[key]) || null;
  }

  // Instant, one-shot symbol effects (js/effects/*.js) — checked first,
  // ahead of the mode system below, since a symbol is only ever wired
  // to one or the other (see js/modes-config.js).
  function symbolFxKeyForIndex(i) {
    const key = "symbol_" + (i + 1);
    return (window.SYMBOL_FX_CONFIG && window.SYMBOL_FX_CONFIG[key]) || null;
  }

  function setActiveSymbolUI(activeIndex) {
    document.querySelectorAll(".nav-symbol").forEach((sym, i) => {
      const isActive = i === activeIndex;
      sym.classList.toggle("active", isActive);
      sym.setAttribute("aria-pressed", String(isActive));
    });
  }

  // Clicking the symbol for the mode that's already active turns it
  // back off (plain archive, no symbol marked active) rather than
  // re-entering it — the reserved symbol (mapped to null) always lands
  // here too, since it has no mode to turn on.
  function handleSymbolActivate(i, e) {
    const fxKey = symbolFxKeyForIndex(i);
    if (fxKey && window.SymbolFX && typeof window.SymbolFX[fxKey] === "function") {
      window.SymbolFX[fxKey](ArchiveAPI, e); // e lets an effect place an activation cue at the triggering click; entirely optional
      return; // an instant trigger never touches mode state or the active-symbol indicator
    }

    const modeId = modeIdForSymbolIndex(i);
    const turningOn = modeId && window.ModeManager.getActiveId() !== modeId;
    window.ModeManager.activate(turningOn ? modeId : null);
    setActiveSymbolUI(turningOn ? i : -1);
  }

  function wireModeSwitching() {
    document.querySelectorAll(".nav-symbol").forEach((sym, i) => {
      sym.addEventListener("click", (e) => handleSymbolActivate(i, e));
      sym.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSymbolActivate(i, e);
        }
      });
    });
  }

  // ---------- card element ----------

  function makeCard(img) {
    const el = document.createElement("div");
    el.className = "photo-card size-" + img.sizeBucket;
    el.dataset.id = img.id;

    const frame = document.createElement("div");
    frame.className = "photo-frame";
    const photo = document.createElement("img");
    photo.src = imgUrl(img);
    photo.alt = "";
    photo.loading = "lazy";
    photo.decoding = "async";
    photo.draggable = false; // the field has its own drag-to-pan, and PLAY WITH THE RULES has its own dragging — don't let the browser's native image-drag ghost fight either
    frame.appendChild(photo);
    el.appendChild(frame);

    // Every image gets the same single dot before its name.
    const caption = document.createElement("div");
    caption.className = "photo-caption";
    caption.innerHTML = `<span class="photo-dots">●</span><span class="photo-name">${img.code}</span>`;
    el.appendChild(caption);

    el.addEventListener("click", () => openIsolation(img));
    return el;
  }

  // ---------- layout: an infinite, pannable, zoomable field ----------
  // The world is tiled into square "chunks" — each one a freshly
  // shuffled pass through the current collection, packed with the
  // exact same per-image placement math the site has always used
  // (jitter/rotation/sizing/gaps via placeImage below). A chunk is
  // just a bounded (CHUNK x CHUNK) version of what used to be an
  // unbounded-downward "region": same algorithm, same look, just
  // tiled in a 2D grid instead of stacked in one endless column, so
  // wandering works in all four directions instead of only down.
  // Panning/zooming is a CSS transform on .canvas (see applyTransform)
  // driven by drag + wheel; chunks near the current view are generated
  // on demand and anything outside it is dropped, so the field can be
  // wandered indefinitely without DOM/memory growing without bound.
  //
  // Tuning knobs, all in world px / zoom multiples so they're easy to adjust:
  const CAPTION_H = 22; // approximate space the always-on caption takes below each photo
  const CHUNK = 1400; // world px per chunk, in both axes
  const CHUNK_BUFFER = 0; // extra ring of chunks preloaded beyond the visible viewport; ensureChunksLoaded
                          // re-runs every frame while panning (see scheduleChunkCheck), so a large buffer
                          // isn't needed to avoid pop-in and would just multiply the DOM footprint
  const CHUNKS_PER_PASS = 2; // caps how many new chunks (each ~dozens of DOM nodes) ensureChunksLoaded
                              // creates per call — zooming out (or a fast pan) can suddenly need many new
                              // chunks at once, and generating all of them synchronously in one frame is
                              // exactly what made zoom/pan feel laggy; capping the batch and letting
                              // scheduleChunkCheck() re-run on the next frame spreads that cost out instead
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 2.2;
  const ZOOM_STEP = 1.25;
  // The initial/default view, and what title/subtitle's reset returns to
  // — derived from "zoom out twice" rather than a hardcoded number, so
  // it stays correct if ZOOM_STEP ever changes.
  const DEFAULT_ZOOM = 1 / (ZOOM_STEP * ZOOM_STEP);
  const DRAG_THRESHOLD = 4; // px of movement before a pointer-down counts as a drag, not a click

  let canvasEl = null;
  let canvasWrapEl = null;
  let toolbarEl = null;
  const pan = { x: 0, y: 0 }; // screen-space position of world (0,0)
  let zoom = 1;
  const chunks = new Map(); // "cx,cy" -> chunk element
  let chunkCheckQueued = false;
  let autoExtendEnabled = true; // modes can pause automatic chunk generation via ArchiveAPI.setAutoExtend

  // canvasWrapEl's own viewport box, read once (a real layout read —
  // getBoundingClientRect/clientWidth force the browser to flush any
  // pending layout) and cached rather than re-read on every zoom click
  // or wheel event. With a large field of chunks mounted, that forced
  // flush was the actual cost behind zoom feeling laggy — the chunk
  // generation itself only ever took a few ms; re-reading layout on
  // every click was what turned it into a 50-70ms blocking task.
  // Updated on init and on window resize, the only two times this
  // box's screen position/size can actually change.
  let wrapWidth = 0, wrapHeight = 0, wrapLeft = 0, wrapTop = 0, toolbarHeight = 0;
  function updateWrapMetrics() {
    const rect = canvasWrapEl.getBoundingClientRect();
    wrapWidth = rect.width;
    wrapHeight = rect.height;
    wrapLeft = rect.left;
    wrapTop = rect.top;
    toolbarHeight = toolbarEl ? toolbarEl.offsetHeight : 0; // also a layout-forcing read — cached alongside for the same reason
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function columnsFor(width) {
    const colWidth = width < 640 ? 135 : width < 1000 ? 160 : 185;
    const cols = Math.max(2, Math.floor(width / colWidth));
    return { cols, actualColWidth: width / cols };
  }

  function shuffledCopy(list) {
    const order = list.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  // Places one image within a chunk's running column layout — the
  // same math the site has always used. Mutates colHeights in place.
  function placeImage(container, img, width, cols, actualColWidth, colHeights) {
    let col;
    if (Math.random() < 0.85) {
      col = colHeights.indexOf(Math.min(...colHeights));
    } else {
      col = Math.floor(Math.random() * cols);
    }
    const w = img.w, h = img.h;
    const jitterX = (Math.random() * 2 - 1) * Math.max(0, (actualColWidth - w) * 0.45);
    let left = col * actualColWidth + (actualColWidth - w) / 2 + jitterX;
    left = Math.max(10, Math.min(width - w - 10, left));

    let gap = 55 + Math.random() * 72;
    if (Math.random() < 0.05) gap = -(5 + Math.random() * 18); // rare, slight overlap
    const top = Math.max(0, colHeights[col] + gap);

    const z = Math.round(10 + Math.random() * 40 + (img.sizeBucket === "large" ? 20 : 0));

    const el = makeCard(img);
    el.style.position = "absolute";
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = w + "px";
    el.style.transform = "rotate(0)";
    el.style.zIndex = z;
    el.querySelector(".photo-frame").style.height = h + "px";
    container.appendChild(el);

    colHeights[col] = top + h + CAPTION_H;
    return { el, col };
  }

  // Fills one CHUNK x CHUNK tile of the world at chunk-grid coordinates
  // (cx, cy) with shuffled passes through the current collection,
  // re-shuffling as needed until every column has filled the chunk's
  // height (guarded so an empty/tiny collection can't loop forever).
  //
  // The "shortest column" bias means some columns can shoot well past
  // CHUNK before the laggard column catches up and the fill loop stops
  // — fine for the old single unbounded strip (it just meant a taller
  // region), but here it would let a chunk's cards spill into the next
  // chunk's own territory. So any placement whose *bottom* (not just
  // its top) would land past CHUNK is discarded — colHeights still
  // records the attempt, so that column is correctly treated as full —
  // and the same photos simply turn up again when the neighboring
  // chunk gets its own fresh shuffle.
  function generateChunk(cx, cy) {
    const el = document.createElement("div");
    el.className = "canvas-chunk";

    // A plain (non-positioned) grouping node — its cards are placed with
    // world-absolute left/top (the chunk's own origin baked in below), the
    // same coordinate space .photo-card left/top has always used, so
    // per-card position reads elsewhere (e.g. modes/play-with-the-rules.js's
    // cardBox, modes/lose-track-of-time.js's cardCenter) don't need to know
    // chunks exist at all.
    const originX = cx * CHUNK, originY = cy * CHUNK;

    const imgs = filteredImages();
    if (imgs.length) {
      const { cols, actualColWidth } = columnsFor(CHUNK);
      const colHeights = new Array(cols).fill(0);
      let guard = 0;
      while (Math.min(...colHeights) < CHUNK && guard < imgs.length * 6) {
        for (const img of shuffledCopy(imgs)) {
          if (Math.min(...colHeights) >= CHUNK) break;
          const { el: cardEl, col } = placeImage(el, img, CHUNK, cols, actualColWidth, colHeights);
          if (colHeights[col] > CHUNK) {
            cardEl.remove();
          } else {
            cardEl.style.left = (parseFloat(cardEl.style.left) + originX) + "px";
            cardEl.style.top = (parseFloat(cardEl.style.top) + originY) + "px";
          }
          guard++;
        }
      }
    }

    canvasEl.appendChild(el);
    chunks.set(cx + "," + cy, el);
  }

  function applyTransform() {
    canvasEl.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
  }

  // Generates chunks now needed to cover the viewport (plus a buffer
  // ring) and drops any chunk outside that range — the range itself is
  // the cap, so DOM size stays bounded by viewport/zoom rather than by
  // how far or how long the user has wandered.
  //
  // Generation is capped at CHUNKS_PER_PASS per call rather than filling
  // the whole missing range in one synchronous pass: a single zoom-out
  // step (or a fast pan) can suddenly need many new chunks — each one
  // dozens of real DOM nodes — and building all of them in one frame is
  // exactly what showed up as long, blocking main-thread tasks (measured
  // 50-70ms) during zoom. Stopping early and re-scheduling another pass
  // for whatever's still missing spreads that same total work over a
  // few frames instead, so no single frame does more than a small,
  // bounded amount of it.
  function ensureChunksLoaded() {
    if (!autoExtendEnabled) return; // a mode can pause automatic chunk generation via ArchiveAPI.setAutoExtend
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(wrapWidth, wrapHeight);
    const minCx = Math.floor(topLeft.x / CHUNK) - CHUNK_BUFFER;
    const maxCx = Math.floor(bottomRight.x / CHUNK) + CHUNK_BUFFER;
    const minCy = Math.floor(topLeft.y / CHUNK) - CHUNK_BUFFER;
    const maxCy = Math.floor(bottomRight.y / CHUNK) + CHUNK_BUFFER;

    let generated = 0;
    for (let cy = minCy; cy <= maxCy && generated < CHUNKS_PER_PASS; cy++) {
      for (let cx = minCx; cx <= maxCx && generated < CHUNKS_PER_PASS; cx++) {
        const key = cx + "," + cy;
        if (!chunks.has(key)) { generateChunk(cx, cy); generated++; }
      }
    }

    for (const [key, el] of chunks) {
      const [cx, cy] = key.split(",").map(Number);
      if (cx < minCx || cx > maxCx || cy < minCy || cy > maxCy) {
        el.remove();
        chunks.delete(key);
      }
    }

    // Anything the budget above didn't get to yet? Cheap to re-check
    // (Map lookups only, no DOM work) — pick up the rest next frame.
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (!chunks.has(cx + "," + cy)) { scheduleChunkCheck(); return; }
      }
    }
  }

  function scheduleChunkCheck() {
    if (chunkCheckQueued) return;
    chunkCheckQueued = true;
    requestAnimationFrame(() => { chunkCheckQueued = false; ensureChunksLoaded(); });
  }

  // Zooms by `factor`, anchored on the given viewport-local point (so
  // the point under the cursor/center stays put rather than the view
  // recentering on the world origin).
  function zoomAt(factor, localX, localY) {
    const before = screenToWorld(localX, localY);
    zoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    pan.x = localX - before.x * zoom;
    pan.y = localY - before.y * zoom;
    applyTransform();
    scheduleChunkCheck();
  }

  function zoomFromButton(factor) {
    zoomAt(factor, wrapWidth / 2, wrapHeight / 2);
  }

  // ---------- drag / wheel panning ----------

  let drag = null; // { pointerId, startX, startY, startPanX, startPanY, moved }
  let suppressNextClick = false;

  // Move/up listeners live on `document` only while a drag is active
  // (added on pointerdown, removed on pointerup) rather than using
  // setPointerCapture — capture redirects the eventual click's target
  // to the capturing element too, which broke opening isolation on a
  // genuine (non-dragging) click.
  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    // A press starting on a card is that card's own gesture (a plain
    // click to isolate it, or — in PLAY WITH THE RULES — its own
    // pick-up-and-move drag, see modes/play-with-the-rules.js); camera
    // panning only starts from open space so the two never compete for
    // the same drag.
    if (e.target.closest(".photo-card")) return;
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y, moved: false };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      drag.moved = true;
      canvasWrapEl.classList.add("dragging");
    }
    if (drag.moved) {
      pan.x = drag.startPanX + dx;
      pan.y = drag.startPanY + dy;
      applyTransform();
      scheduleChunkCheck();
    }
  }

  function onPointerUp(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.moved) suppressNextClick = true;
    canvasWrapEl.classList.remove("dragging");
    drag = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch (browsers report it as a ctrl+wheel) or ctrl+wheel.
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - wrapLeft, e.clientY - wrapTop);
    } else {
      pan.x -= e.deltaX;
      pan.y -= e.deltaY;
      applyTransform();
      scheduleChunkCheck();
    }
  }

  // Resets the field to an empty world and re-centers the view — used
  // on first load and whenever the underlying image set changes (a
  // future collection filter via the symbols would call this too).
  function resetField() {
    canvasEl.innerHTML = "";
    chunks.clear();
    pan.x = wrapWidth / 2;
    pan.y = toolbarHeight + 24;
    zoom = DEFAULT_ZOOM;
    applyTransform();
    ensureChunksLoaded();
  }

  // ---------- isolation view ----------

  // A mode can swap out which images get suggested when the viewer
  // opens a photo, without touching how they're shown — see
  // ArchiveAPI.setAssociationStrategy below. null means "use the
  // archive's own loose-association trail" (defaultAssociations).
  // Reset to null on every mode switch by resetView(), so a mode never
  // has to clean this up itself.
  let associationStrategy = null;

  function computeAssociations(img) {
    if (associationStrategy) {
      try {
        const result = associationStrategy(img, images, state.trail);
        if (Array.isArray(result) && result.length) return result;
      } catch (e) {
        console.error("[association strategy]", e);
      }
    }
    return defaultAssociations(img);
  }

  function defaultAssociations(img) {
    const pool = images.filter((i) => i.id !== img.id);
    const notInTrail = pool.filter((i) => !state.trail.includes(i.id));
    const source = notInTrail.length ? notInTrail : pool;
    const used = [];

    function takeBest(scoreFn) {
      const candidates = source.filter((i) => !used.includes(i.id));
      const pick = pickBest(candidates.length ? candidates : source, scoreFn, false);
      if (pick) used.push(pick.id);
      return pick;
    }

    function takeMatching(matchFn) {
      const matches = source.filter((i) => matchFn(i) && !used.includes(i.id));
      const pick = matches.length ? matches[Math.floor(Math.random() * matches.length)] : null;
      if (pick) used.push(pick.id);
      return pick;
    }

    const byColor = takeBest((i) => hueDist(i.hue, img.hue));
    const byMood = takeMatching((i) => i.mood === img.mood);
    const bySubject = takeMatching((i) => i.subject === img.subject);
    const byTexture = takeMatching((i) => i.texture === img.texture);
    const byReason = img.keptBecause
      ? takeMatching((i) => i.keptBecause === img.keptBecause)
      : null;
    const byTime = img.date
      ? takeBest((i) => (i.date ? Math.abs(i.date - img.date) : Infinity))
      : null;

    return [
      { label: "same color", image: byColor },
      { label: "same mood — " + img.mood, image: byMood },
      { label: "same subject — " + img.subject, image: bySubject },
      { label: "same texture — " + img.texture, image: byTexture },
      { label: "kept for a similar reason", image: byReason },
      { label: "around the same time", image: byTime },
    ].filter((p) => p.image);
  }

  function renderTrail() {
    const trailEl = document.getElementById("isolation-trail");
    trailEl.innerHTML = "";
    state.trail.forEach((id, i) => {
      const im = images.find((x) => x.id === id);
      const dot = document.createElement("button");
      dot.className = "trail-dot" + (id === state.isolatedId ? " current" : "");
      dot.style.backgroundImage = `url('${imgUrl(im)}')`;
      dot.title = im.code;
      dot.addEventListener("click", () => {
        state.trail = state.trail.slice(0, i + 1);
        state.isolatedId = id;
        renderIsolation(im);
      });
      trailEl.appendChild(dot);
      if (i < state.trail.length - 1) {
        const sep = document.createElement("span");
        sep.className = "trail-sep";
        sep.textContent = "···";
        trailEl.appendChild(sep);
      }
    });
  }

  function renderPaths(img) {
    const assoc = computeAssociations(img);
    const left = document.getElementById("paths-left");
    const right = document.getElementById("paths-right");
    left.innerHTML = "";
    right.innerHTML = "";

    // Stagger each column into two loose sub-columns (1st & 3rd out one
    // way, 2nd out the other) so the suggestions curve around the photo
    // instead of lining up in a straight row.
    const OUTER = 28;
    const INNER = -12;
    const counts = { left: 0, right: 0 };

    assoc.forEach((p, i) => {
      const side = i % 2 === 0 ? "left" : "right";
      const target = side === "left" ? left : right;
      const posInSide = counts[side]++;
      const magnitude = posInSide % 2 === 0 ? OUTER : INNER;
      const shift = side === "left" ? -magnitude : magnitude;

      const btn = document.createElement("button");
      btn.className = "path-btn";
      btn.style.transform = `translateX(${shift}px)`;
      btn.title = p.label;
      btn.setAttribute("aria-label", p.label);
      btn.innerHTML = `<span class="path-thumb" style="background-image:url('${imgUrl(p.image)}')"></span>`;
      btn.addEventListener("click", () => {
        state.trail.push(p.image.id);
        state.isolatedId = p.image.id;
        renderIsolation(p.image);
      });
      target.appendChild(btn);
    });
  }

  function renderIsolation(img) {
    const stage = document.getElementById("isolation-image");
    stage.src = imgUrl(img);

    const aspect = img.w / img.h;
    const maxW = Math.min(window.innerWidth * 0.4, 420);
    const maxH = Math.min(window.innerHeight * 0.46, 380);
    let dispW = Math.min(340, maxW);
    let dispH = dispW / aspect;
    if (dispH > maxH) { dispH = maxH; dispW = dispH * aspect; }
    if (dispW > maxW) { dispW = maxW; dispH = dispW / aspect; }
    stage.style.width = dispW + "px";
    stage.style.height = dispH + "px";

    renderTrail();
    renderPaths(img);
  }

  function openIsolation(img) {
    state.trail = [img.id];
    state.isolatedId = img.id;
    document.getElementById("isolation").hidden = false;
    document.body.classList.add("isolating");
    renderIsolation(img);
  }

  function closeIsolation() {
    document.getElementById("isolation").hidden = true;
    document.body.classList.remove("isolating");
    state.trail = [];
    state.isolatedId = null;
  }

  // ---------- info panel ----------

  function openInfoPanel() {
    document.getElementById("info-panel").hidden = false;
    document.getElementById("info-btn").setAttribute("aria-expanded", "true");
  }

  function closeInfoPanel() {
    document.getElementById("info-panel").hidden = true;
    document.getElementById("info-btn").setAttribute("aria-expanded", "false");
  }

  // ---------- mode system bridge ----------
  // The curated surface every mode gets as ctx.archive. Modes read the
  // archive and hook into it only through this object — never by
  // reaching into app.js internals directly — so what a mode can touch
  // stays deliberate and stable. getImages() returns the permanent,
  // shared photo data (positions/metadata/collections all live on it);
  // treat it as read-only, since every mode draws from the same list.
  const ArchiveAPI = {
    getImages() { return images; },
    getCanvasEl() { return canvasEl; },
    getCanvasWrapEl() { return canvasWrapEl; },
    getCards() { return canvasEl ? Array.from(canvasEl.querySelectorAll(".photo-card")) : []; },
    cardFor(imgId) { return canvasEl ? canvasEl.querySelector('.photo-card[data-id="' + imgId + '"]') : null; },
    // The currently visible viewport, in the same world coordinates
    // card left/top are placed in (see generateChunk) — lets a mode
    // reason about "what's on screen right now" now that the field pans
    // freely instead of just scrolling down (see modes/lose-track-of-time.js).
    getViewportBounds() {
      const topLeft = screenToWorld(0, 0);
      const bottomRight = screenToWorld(wrapWidth, wrapHeight);
      return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
    },
    openIsolation,
    closeIsolation,
    setAutoExtend(on) { autoExtendEnabled = !!on; },
    // Lets a mode change which images get suggested when the viewer
    // opens a photo (the isolation view's flanking "paths" + trail —
    // see computeAssociations above), without touching how that view
    // itself works. `fn(img, images, trail)` should return an array of
    // { label, image } pairs, same shape as the default algorithm; an
    // empty/invalid result quietly falls back to the default. Pass
    // null/omit to go back to the default. Reset to null automatically
    // on every mode switch (see resetView below), so a mode never has
    // to restore it on its way out.
    setAssociationStrategy(fn) {
      associationStrategy = typeof fn === "function" ? fn : null;
    },
    // Rebuilds the canvas straight from the permanent image data,
    // discarding whatever's currently been done to the DOM (dragged
    // positions, temporary elements, added classes...) without ever
    // touching that underlying data itself. A mode can call this itself
    // to offer an in-place "restore the arrangement" moment without
    // leaving the mode (see e.g. play-with-the-rules.js's double-click
    // reset); ModeManager also calls it on every mode switch, via
    // resetView() below.
    rerender() {
      resetField();
    },
    // The reset hook ModeManager calls on every mode switch, before the
    // next mode (if any) enters.
    resetView() {
      autoExtendEnabled = true;
      associationStrategy = null;
      this.rerender();
    },
  };

  // ---------- init ----------

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function init() {
    // Also wait for the webfont before measuring the header's height
    // below (resetField) — the fallback font can wrap the mobile header
    // to fewer lines, understating its height and leaving the initial
    // pan offset too small.
    await Promise.all([preloadDimensions(), document.fonts.ready]);

    canvasEl = document.getElementById("canvas");
    canvasWrapEl = document.getElementById("canvas-wrap");
    toolbarEl = document.querySelector(".toolbar");

    updateWrapMetrics();
    resetField();

    window.ModeManager.configure(ArchiveAPI);
    wireModeSwitching();

    // Title/subtitle == reset to the site's fresh/default state. A true
    // reload (rather than an in-app state reset) is deliberate: between
    // the mode system, the pan/zoom camera, and each effect's own
    // transient DOM/timers (duplicates' clusters, cursor-trail's stuck
    // traces, magnet's grab state, drift's springs...), there's no
    // single place that owns "everything temporary" to tear down by
    // hand — a reload is the only way to guarantee all of it, including
    // zoom/pan, actually returns to first-load state.
    const brandHome = document.getElementById("brand-home");
    brandHome.addEventListener("click", () => window.location.reload());
    brandHome.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.reload();
      }
    });

    canvasWrapEl.addEventListener("pointerdown", onPointerDown);
    canvasWrapEl.addEventListener("wheel", onWheel, { passive: false });
    // Consumes suppressNextClick on the very next click anywhere in the
    // field — capture phase, so it runs (and can stop) before a card's
    // own click listener sees it — regardless of whether the drag
    // happened to end over a card or over empty space.
    canvasWrapEl.addEventListener("click", (e) => {
      if (suppressNextClick) { suppressNextClick = false; e.stopPropagation(); }
    }, true);

    document.getElementById("zoom-in").addEventListener("click", () => zoomFromButton(ZOOM_STEP));
    document.getElementById("zoom-out").addEventListener("click", () => zoomFromButton(1 / ZOOM_STEP));

    document.getElementById("isolation-close").addEventListener("click", closeIsolation);
    document.getElementById("isolation").addEventListener("click", (e) => {
      if (e.target.id === "isolation") closeIsolation();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("isolation").hidden) closeIsolation();
    });

    document.getElementById("info-btn").addEventListener("click", () => {
      document.getElementById("info-panel").hidden ? openInfoPanel() : closeInfoPanel();
    });
    document.getElementById("info-panel-close").addEventListener("click", closeInfoPanel);
    document.addEventListener("click", (e) => {
      const panel = document.getElementById("info-panel");
      if (panel.hidden) return;
      if (panel.contains(e.target) || e.target.closest("#info-btn")) return;
      closeInfoPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("info-panel").hidden) closeInfoPanel();
    });

    window.addEventListener("resize", debounce(() => { updateWrapMetrics(); resetField(); }, 200));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
