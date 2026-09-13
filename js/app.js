/* ------------------------------------------------------------------
   app.js
   Rendering + interaction for the camera-roll prototype.
   Depends on window.APP_DATA from data.js.
------------------------------------------------------------------- */

(function () {
  const { images, collections, libraryCover } = window.APP_DATA;

  const state = {
    collectionId: "all",
    trail: [],
    isolatedId: null,
  };

  // ---------- helpers ----------

  function imgUrl(img) {
    return "images/" + img.file;
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

  function filteredImages() {
    if (state.collectionId === "all") return images;
    return images.filter((i) => i.collections.includes(state.collectionId));
  }

  // Collection names are stored as "TITLE [tag]" — split them so the
  // sidebar can show the title and bracketed tag on their own lines.
  function splitTitle(name) {
    const m = name.match(/^(.*)\s\[(.*)\]\s*$/);
    return m ? { title: m[1], tag: m[2] } : { title: name, tag: "" };
  }

  // Find an image by its filename (used to resolve manually-set cover
  // images) — returns null if not set or not found.
  function findByFile(file) {
    if (!file) return null;
    return images.find((im) => im.file === file) || null;
  }

  // A collection's sidebar thumbnail: uses its manually-set `cover`
  // filename when present, otherwise falls back to the first photo
  // found in that collection (the previous automatic behavior).
  function coverFor(collectionId) {
    const col = collections.find((c) => c.id === collectionId);
    const manual = col ? findByFile(col.cover) : null;
    if (manual) return manual;
    const member = images.find((im) => im.collections.includes(collectionId));
    return member || images[0];
  }

  // The main "Library" nav item's thumbnail: manually-set LIBRARY_COVER
  // (from data.js), falling back to the first photo overall.
  function libraryCoverImage() {
    return findByFile(libraryCover) || images[0];
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

  // ---------- sidebar ----------

  function renderSidebar() {
    document.getElementById("nav-all-preview").style.backgroundImage = `url('${imgUrl(libraryCoverImage())}')`;
    document.getElementById("nav-all").addEventListener("click", () => selectCollection("all"));

    const nav = document.getElementById("collections-nav");
    nav.innerHTML = '<div class="nav-label">collections</div>';
    collections.forEach((col) => {
      const cover = coverFor(col.id);
      const { title, tag } = splitTitle(col.name.toLowerCase());
      const btn = document.createElement("button");
      btn.className = "nav-item";
      btn.dataset.collection = col.id;
      btn.innerHTML = `<span class="nav-item-preview" style="background-image:url('${imgUrl(cover)}')"></span>
        <span class="nav-item-name">
          <span class="nav-item-title">${title}</span>
          ${tag ? `<span class="nav-item-tag">${tag}</span>` : ""}
        </span>`;
      btn.addEventListener("click", () => selectCollection(col.id));
      nav.appendChild(btn);
    });
  }

  function updateNavActive() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.collection === state.collectionId);
    });
  }

  function updateHeader(count) {
    const titleEl = document.getElementById("collection-title");
    const countEl = document.getElementById("collection-count");
    const blurbEl = document.getElementById("collection-blurb");
    if (state.collectionId === "all") {
      titleEl.textContent = "all photos";
      blurbEl.textContent = "";
    } else {
      const col = collections.find((c) => c.id === state.collectionId);
      titleEl.textContent = col.name.toLowerCase();
      blurbEl.textContent = "";
    }
    countEl.textContent = count + (count === 1 ? " image" : " images");
  }

  function selectCollection(id) {
    state.collectionId = id;
    updateNavActive();
    renderCanvas();
    closeSidebarOnMobile();
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

    el.addEventListener("mouseenter", () => showMeta(img));
    el.addEventListener("mouseleave", hideMeta);
    el.addEventListener("click", () => openIsolation(img));
    return el;
  }

  // ---------- layout ----------
  // A single scattered composition: loosely packed, jittered, rotated,
  // sized by each photo's real aspect ratio, with generous breathing
  // room between images and only a rare, slight overlap.

  const CAPTION_H = 22; // approximate space the always-on caption takes below each photo

  function layoutWander(container, imgs) {
    const width = container.clientWidth || 900;
    const colWidth = width < 640 ? 175 : width < 1000 ? 210 : 245;
    const cols = Math.max(2, Math.floor(width / colWidth));
    const actualColWidth = width / cols;
    const colHeights = new Array(cols).fill(0);

    const order = imgs.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    order.forEach((img) => {
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
    });

    container.style.height = Math.max(...colHeights, 300) + 160 + "px";
  }

  function renderCanvas() {
    const canvas = document.getElementById("canvas");
    canvas.innerHTML = "";
    canvas.style.height = "";

    const imgs = filteredImages();
    updateHeader(imgs.length);
    layoutWander(canvas, imgs);
  }

  // ---------- metadata panel (docked to the bottom of the sidebar) ----------

  function setMetaPanel(img) {
    document.getElementById("meta-name").textContent = img ? img.code : "";
    document.getElementById("meta-caption").textContent = img ? img.caption : "";
    document.getElementById("meta-type").textContent = img ? img.type : "";
    document.getElementById("meta-kept").textContent = img ? img.keptBecause : "";
    document.getElementById("meta-source").textContent = img ? img.source : "";
    document.getElementById("meta-when").textContent = img ? img.dateLabel : "";
    document.getElementById("meta-where").textContent = img ? img.location : "";
    document.getElementById("meta-returned").textContent = img ? img.returnedTo : "";
    document.getElementById("meta-connection").textContent = img ? img.connection : "";
  }

  function showMeta(img) {
    if (!document.getElementById("isolation").hidden) return;
    setMetaPanel(img);
  }

  function hideMeta() {
    if (!document.getElementById("isolation").hidden) return;
    setMetaPanel(null);
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

    // Associations are built only from real, manually-edited metadata
    // (no internal/randomized tags) — so they get more meaningful as
    // that metadata is filled in, and simply drop out while it's blank.
    const byReason = img.keptBecause ? takeMatching((i) => i.keptBecause && i.keptBecause === img.keptBecause) : null;
    const bySource = img.source ? takeMatching((i) => i.source && i.source === img.source) : null;
    const byLocation = img.location ? takeMatching((i) => i.location && i.location === img.location) : null;
    const byTime = img.date ? takeBest((i) => i.date ? Math.abs(i.date - img.date) : Infinity) : null;

    return [
      { label: "kept for a similar reason", image: byReason },
      { label: "same source", image: bySource },
      { label: "same location", image: byLocation },
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
      btn.innerHTML = `<span class="path-thumb" style="background-image:url('${imgUrl(p.image)}')"></span><span class="path-label">${p.label}</span>`;
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
    const maxW = Math.min(window.innerWidth * 0.5, 520);
    const maxH = Math.min(window.innerHeight * 0.56, 480);
    let dispW = Math.min(420, maxW);
    let dispH = dispW / aspect;
    if (dispH > maxH) { dispH = maxH; dispW = dispH * aspect; }
    if (dispW > maxW) { dispW = maxW; dispH = dispW / aspect; }
    stage.style.width = dispW + "px";
    stage.style.height = dispH + "px";

    // Metadata for the isolated photo lives in the same corner dock as
    // the hover metadata, not inline in the stage.
    setMetaPanel(img);

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
    setMetaPanel(null);
  }

  // ---------- sidebar toggle (mobile) ----------

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 820) {
      document.getElementById("app").classList.remove("sidebar-open");
    }
  }

  // ---------- init ----------

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function init() {
    await preloadDimensions();

    renderSidebar();
    updateNavActive();
    renderCanvas();
    setMetaPanel(null);

    document.getElementById("shuffle-btn").addEventListener("click", renderCanvas);

    document.getElementById("isolation-close").addEventListener("click", closeIsolation);
    document.getElementById("isolation").addEventListener("click", (e) => {
      if (e.target.id === "isolation") closeIsolation();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("isolation").hidden) closeIsolation();
    });

    document.getElementById("sidebar-toggle").addEventListener("click", () => {
      document.getElementById("app").classList.toggle("sidebar-open");
    });

    window.addEventListener("resize", debounce(renderCanvas, 200));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
