/* ------------------------------------------------------------------
   app.js
   Rendering + interaction for the camera-roll prototype.
   Depends on window.APP_DATA from data.js.
------------------------------------------------------------------- */

(function () {
  const { images, symbolLabels } = window.APP_DATA;

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

  // ---------- icon nav (category symbols) ----------
  // Purely a label reveal for now — the symbols aren't wired to
  // filtering yet, so this just pairs each static nav-symbol with its
  // name from data.js, in order.

  function renderSymbolLabels() {
    document.querySelectorAll(".nav-symbol").forEach((sym, i) => {
      const label = sym.querySelector(".nav-symbol-label");
      if (!label) return;
      label.textContent = symbolLabels[i] || "";
      const clamp = () => clampSymbolLabel(sym, label);
      sym.addEventListener("mouseenter", clamp);
      sym.addEventListener("focus", clamp);
    });
  }

  // Long labels centered under a symbol near the left/right edge would
  // otherwise get clipped by .main's overflow:hidden; nudge them inward
  // via the --label-shift custom property (see style.css) instead.
  function clampSymbolLabel(sym, label) {
    label.style.setProperty("--label-shift", "0px");
    const mainRect = document.querySelector(".main").getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const pad = 8;
    let shift = 0;
    if (labelRect.left < mainRect.left + pad) shift = (mainRect.left + pad) - labelRect.left;
    else if (labelRect.right > mainRect.right - pad) shift = (mainRect.right - pad) - labelRect.right;
    if (shift) label.style.setProperty("--label-shift", shift + "px");
  }

  // Not called from anywhere yet (no UI sets a collection id besides
  // "all") — left in place for the symbol-driven filtering that will
  // replace the old sidebar's job.
  function selectCollection(id) {
    state.collectionId = id;
    renderCanvas();
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
  function handleSymbolActivate(i) {
    const modeId = modeIdForSymbolIndex(i);
    const turningOn = modeId && window.ModeManager.getActiveId() !== modeId;
    window.ModeManager.activate(turningOn ? modeId : null);
    setActiveSymbolUI(turningOn ? i : -1);
  }

  function wireModeSwitching() {
    document.querySelectorAll(".nav-symbol").forEach((sym, i) => {
      sym.addEventListener("click", () => handleSymbolActivate(i));
      sym.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSymbolActivate(i);
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
    frame.appendChild(photo);
    el.appendChild(frame);

    // Primary photos get one dot before the name, secondary get two.
    const dots = img.type === "primary" ? "●" : "●●";
    const caption = document.createElement("div");
    caption.className = "photo-caption";
    caption.innerHTML = `<span class="photo-dots">${dots}</span><span class="photo-name">${img.code}</span>`;
    el.appendChild(caption);

    el.addEventListener("mouseenter", () => showMeta(img, frame));
    el.addEventListener("mouseleave", hideMeta);
    el.addEventListener("click", () => openIsolation(img));
    return el;
  }

  // ---------- layout ----------
  // An open-ended scattered composition: instead of laying the whole
  // collection out once into a fixed-height canvas, the canvas grows
  // downward in "regions" — one freshly shuffled pass through the
  // current collection each — generated as the user scrolls near the
  // bottom. Older regions are pruned once enough newer ones exist, so
  // wandering never hits a hard edge but the DOM stays bounded. Every
  // region uses the exact same per-image placement math the original
  // single-pass layout used (same jitter/rotation/sizing/gaps), just
  // continuing from wherever the previous region's columns left off,
  // so a loop through the set never looks identical to the one before.
  //
  // Tuning knobs, all in px/screens/count so they're easy to adjust:
  const CAPTION_H = 22; // approximate space the always-on caption takes below each photo
  const EXTEND_BUFFER_PX = 1600; // start generating more once within this many px of the bottom
  const MAX_LIVE_REGIONS = 4; // shuffled passes kept mounted at once; older ones are pruned
  const INITIAL_FILL_SCREENS = 1.5; // viewport-heights of content to pre-fill on load/reset

  let canvasEl = null;
  let canvasWrapEl = null;
  let layout = null; // { width, cols, actualColWidth, colHeights, bottom, regions, imgs }
  let extending = false;
  let autoExtendEnabled = true; // modes can pause the scroll-triggered region generation via ArchiveAPI.setAutoExtend

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

  // Places one image within the running column layout — identical math
  // to the original single-pass algorithm, just operating on layout
  // state that now persists across regions instead of being local to
  // one call. Mutates colHeights in place.
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

    const rotation = (Math.random() * 14 - 7).toFixed(1);
    const z = Math.round(10 + Math.random() * 40 + (img.sizeBucket === "large" ? 20 : 0));

    const el = makeCard(img);
    el.style.position = "absolute";
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = w + "px";
    el.style.transform = `rotate(${rotation}deg)`;
    el.style.zIndex = z;
    el.querySelector(".photo-frame").style.height = h + "px";
    container.appendChild(el);

    colHeights[col] = top + h + CAPTION_H;
  }

  // Lays out one freshly shuffled pass through the current collection,
  // continuing downward from the layout's current column heights.
  // Returns false (and does nothing) once there's nothing to lay out,
  // so callers can use it as a loop condition without spinning forever.
  // Deliberately does NOT prune here — see pruneOldRegions below.
  function generateRegion() {
    if (!layout || !layout.imgs.length) return false;

    const region = document.createElement("div");
    region.className = "canvas-region";
    shuffledCopy(layout.imgs).forEach((img) => {
      placeImage(region, img, layout.width, layout.cols, layout.actualColWidth, layout.colHeights);
    });
    canvasEl.appendChild(region);
    layout.regions.push(region);

    layout.bottom = Math.max(...layout.colHeights, 0) + 160;
    canvasEl.style.height = layout.bottom + "px";
    return true;
  }

  // Drops the oldest live region(s) once more than MAX_LIVE_REGIONS
  // exist. Only ever called from scroll-driven extension, never from
  // the initial fill in renderCanvas — a small/filtered collection can
  // need several tiny regions just to cover the first screen, and
  // pruning during that initial fill would delete the very top of the
  // page before the user ever scrolled anywhere.
  function pruneOldRegions() {
    while (layout.regions.length > MAX_LIVE_REGIONS) {
      layout.regions.shift().remove();
    }
  }

  // Called on scroll: tops up the canvas once the unscrolled buffer
  // below the viewport runs low, then prunes anything now well above
  // the top of the live window. Guarded by `extending` (reset on the
  // next frame, once layout has caught up) so a burst of scroll events
  // can't trigger overlapping runs, and by a hard iteration cap so an
  // empty/tiny collection can never loop forever.
  function extendCanvasIfNeeded() {
    if (extending || !layout || !autoExtendEnabled) return;
    const remaining = () => layout.bottom - (canvasWrapEl.scrollTop + canvasWrapEl.clientHeight);
    if (remaining() >= EXTEND_BUFFER_PX) return;

    extending = true;
    let guard = 0;
    while (guard++ < 50 && remaining() < EXTEND_BUFFER_PX && generateRegion()) { /* keep extending */ }
    pruneOldRegions();
    requestAnimationFrame(() => { extending = false; });
  }

  function renderCanvas() {
    canvasEl.innerHTML = "";
    canvasEl.style.height = "";
    canvasWrapEl.scrollTop = 0;

    const imgs = filteredImages();

    const width = canvasEl.clientWidth || 900;
    const { cols, actualColWidth } = columnsFor(width);
    layout = { width, cols, actualColWidth, colHeights: new Array(cols).fill(0), bottom: 0, regions: [], imgs };

    // Pre-fill the initial view (plus a little buffer) synchronously;
    // scrolling takes over from there via extendCanvasIfNeeded.
    let guard = 0;
    while (guard++ < 50 && layout.bottom < canvasWrapEl.clientHeight * (1 + INITIAL_FILL_SCREENS) && generateRegion()) { /* keep filling */ }
  }

  // ---------- metadata panel (a small floating note beside the selected image) ----------
  // image name + type stay on the `img` object (used for captions and dot
  // count elsewhere) but are intentionally not surfaced in this panel.
  // kept/connection/returned are the primary, always-labeled fields;
  // when/where/source are secondary and only appear when filled in, so
  // they never compete with the primary three.

  function setMetaPanel(img) {
    const caption = document.getElementById("meta-caption");
    caption.textContent = img ? img.caption : "";
    caption.hidden = !(img && img.caption);

    document.getElementById("meta-kept").textContent = img ? img.keptBecause : "";
    document.getElementById("meta-connection").textContent = img ? img.connection : "";
    document.getElementById("meta-returned").textContent = img ? img.returnedTo : "";

    const secondary = [
      ["meta-when-row", img && img.dateLabel, "meta-when", img && img.dateLabel],
      ["meta-where-row", img && img.location, "meta-where", img && img.location],
      ["meta-source-row", img && img.source, "meta-source", img && img.source],
    ];
    let anySecondary = false;
    secondary.forEach(([rowId, has, valId, val]) => {
      document.getElementById(rowId).hidden = !has;
      document.getElementById(valId).textContent = val || "";
      if (has) anySecondary = true;
    });
    document.getElementById("meta-secondary").hidden = !anySecondary;
  }

  // Places the floating panel just beside `targetEl` (a photo frame or the
  // isolation stage image), clamped so it never runs off the viewport.
  function positionMetaPanel(targetEl) {
    const panel = document.getElementById("meta-panel");
    const rect = targetEl.getBoundingClientRect();
    const margin = 14;

    panel.style.visibility = "hidden";
    panel.classList.add("visible");
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;

    let left = rect.right + margin;
    if (left + pw + margin > window.innerWidth) {
      left = rect.left - pw - margin;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

    let top = rect.top;
    top = Math.max(margin, Math.min(top, window.innerHeight - ph - margin));

    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.visibility = "";
  }

  // Does the actual work of showing the panel next to `targetEl`. Used
  // directly by the isolation view (which manages its own open/closed
  // state) and, guarded, by card hover below.
  function applyMetaPanel(img, targetEl) {
    setMetaPanel(img);
    if (targetEl) positionMetaPanel(targetEl);
    document.getElementById("meta-panel").classList.add("visible");
  }

  function hideMetaPanel() {
    document.getElementById("meta-panel").classList.remove("visible");
  }

  function showMeta(img, targetEl) {
    if (!document.getElementById("isolation").hidden) return;
    applyMetaPanel(img, targetEl);
  }

  function hideMeta() {
    if (!document.getElementById("isolation").hidden) return;
    hideMetaPanel();
  }

  // ---------- isolation view ----------

  function computeAssociations(img) {
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

    // Metadata for the isolated photo floats beside the stage image,
    // the same way it floats beside a hovered card in the canvas.
    applyMetaPanel(img, stage);

    renderTrail();
    renderPaths(img);
  }

  function openIsolation(img) {
    state.trail = [img.id];
    state.isolatedId = img.id;
    document.getElementById("isolation").hidden = false;
    renderIsolation(img);
  }

  function closeIsolation() {
    document.getElementById("isolation").hidden = true;
    state.trail = [];
    state.isolatedId = null;
    hideMetaPanel();
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
    openIsolation,
    closeIsolation,
    showMeta,
    hideMeta,
    setAutoExtend(on) { autoExtendEnabled = !!on; },
    // The reset hook ModeManager calls on every mode switch, before the
    // next mode (if any) enters: rebuilds the canvas straight from the
    // permanent image data, discarding whatever the previous mode did
    // to the DOM (dragged positions, temporary elements, added
    // classes...) without ever touching that underlying data itself.
    resetView() {
      autoExtendEnabled = true;
      renderCanvas();
      hideMeta();
    },
  };

  // ---------- init ----------

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function init() {
    await preloadDimensions();

    canvasEl = document.getElementById("canvas");
    canvasWrapEl = document.getElementById("canvas-wrap");

    renderCanvas();
    renderSymbolLabels();
    hideMetaPanel();

    window.ModeManager.configure(ArchiveAPI);
    wireModeSwitching();

    canvasWrapEl.addEventListener("scroll", extendCanvasIfNeeded, { passive: true });

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
      if (panel.contains(e.target) || e.target.id === "info-btn") return;
      closeInfoPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("info-panel").hidden) closeInfoPanel();
    });

    window.addEventListener("resize", debounce(() => { renderCanvas(); hideMeta(); }, 200));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
