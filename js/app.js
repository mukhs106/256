/* ------------------------------------------------------------------
   app.js
   Rendering + interaction for the camera-roll prototype.
   Depends on window.APP_DATA from data.js.
------------------------------------------------------------------- */

(function () {
  const { images, collections } = window.APP_DATA;

  const DOT_PALETTE = ["#c98a6b", "#8fa877", "#b087ac", "#7ea3b0", "#d1ab5a", "#9c8ac9", "#6fab93", "#c17e8c"];

  const state = {
    collectionId: "all",
    mode: "wander",
    trail: [],
    isolatedId: null,
  };

  // ---------- helpers ----------

  function colorCss(img) {
    return `linear-gradient(135deg, hsl(${img.hue} ${img.sat}% ${img.light1}%), hsl(${img.hue2} ${img.sat}% ${img.light2}%))`;
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

  function filteredImages() {
    if (state.collectionId === "all") return images;
    return images.filter((i) => i.collections.includes(state.collectionId));
  }

  // ---------- sidebar ----------

  function renderSidebar() {
    const nav = document.getElementById("collections-nav");
    nav.innerHTML = '<div class="nav-label">Collections</div>';
    collections.forEach((col, i) => {
      const count = images.filter((im) => im.collections.includes(col.id)).length;
      const btn = document.createElement("button");
      btn.className = "nav-item";
      btn.dataset.collection = col.id;
      btn.innerHTML = `<span class="nav-item-dot" style="background:${DOT_PALETTE[i % DOT_PALETTE.length]}"></span>
        <span class="nav-item-name">${col.name}</span>
        <span class="nav-item-count">${count}</span>`;
      btn.addEventListener("click", () => selectCollection(col.id));
      nav.appendChild(btn);
    });

    document.querySelector('[data-count="all"]').textContent = images.length;
    document.querySelector('.nav-item[data-collection="all"]').addEventListener("click", () => selectCollection("all"));
  }

  function updateNavActive() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.collection === state.collectionId);
    });
  }

  function updateModeActive() {
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });
  }

  function updateHeader(count) {
    const titleEl = document.getElementById("collection-title");
    const countEl = document.getElementById("collection-count");
    const blurbEl = document.getElementById("collection-blurb");
    if (state.collectionId === "all") {
      titleEl.textContent = "All Photos";
      blurbEl.textContent = "";
    } else {
      const col = collections.find((c) => c.id === state.collectionId);
      titleEl.textContent = col.name;
      blurbEl.textContent = col.blurb;
    }
    countEl.textContent = count + (count === 1 ? " image" : " images");
  }

  function selectCollection(id) {
    state.collectionId = id;
    if (id !== "all") {
      const col = collections.find((c) => c.id === id);
      state.mode = col.defaultView;
    } else {
      state.mode = "wander";
    }
    updateNavActive();
    updateModeActive();
    renderCanvas();
    closeSidebarOnMobile();
  }

  function setMode(mode) {
    state.mode = mode;
    updateModeActive();
    renderCanvas();
  }

  // ---------- card element ----------

  function makeCard(img) {
    const el = document.createElement("div");
    el.className = "photo-card size-" + img.sizeBucket;
    el.dataset.id = img.id;
    el.style.background = colorCss(img);

    const tag = document.createElement("span");
    tag.className = "photo-index";
    tag.textContent = img.code;
    el.appendChild(tag);

    el.addEventListener("mouseenter", () => showMeta(img));
    el.addEventListener("mouseleave", hideMeta);
    el.addEventListener("click", () => openIsolation(img));
    return el;
  }

  // ---------- layouts ----------

  function layoutWander(container, imgs) {
    const width = container.clientWidth || 900;
    const colWidth = width < 620 ? 150 : width < 960 ? 190 : 220;
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
      if (Math.random() < 0.82) {
        col = colHeights.indexOf(Math.min(...colHeights));
      } else {
        col = Math.floor(Math.random() * cols);
      }
      const w = img.w, h = img.h;
      const jitterX = (Math.random() * 2 - 1) * Math.max(0, (actualColWidth - w) * 0.4);
      let left = col * actualColWidth + (actualColWidth - w) / 2 + jitterX;
      left = Math.max(6, Math.min(width - w - 6, left));

      let gap = 20 + Math.random() * 26;
      if (Math.random() < 0.15) gap = -(6 + Math.random() * 38); // occasional overlap
      const top = Math.max(0, colHeights[col] + gap);

      const rotation = (Math.random() * 16 - 8).toFixed(1);
      const z = Math.round(10 + Math.random() * 40 + (img.sizeBucket === "large" ? 20 : 0));

      const el = makeCard(img);
      el.style.position = "absolute";
      el.style.left = left + "px";
      el.style.top = top + "px";
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.style.transform = `rotate(${rotation}deg)`;
      el.style.zIndex = z;
      container.appendChild(el);

      colHeights[col] = top + h;
    });

    container.style.height = Math.max(...colHeights, 300) + 140 + "px";
  }

  function layoutOptimize(container, imgs) {
    const sorted = imgs.slice().sort((a, b) => a.date - b.date);
    sorted.forEach((img) => {
      const el = makeCard(img);
      container.appendChild(el);
    });
  }

  function layoutColor(container, imgs) {
    const sorted = imgs.slice().sort((a, b) => a.hue - b.hue);
    sorted.forEach((img) => {
      const targetH = 120;
      const w = Math.round(targetH * (img.w / img.h));
      const el = makeCard(img);
      el.style.width = w + "px";
      el.style.height = targetH + "px";
      container.appendChild(el);
    });
  }

  function layoutTimeline(container, imgs) {
    const sorted = imgs.slice().sort((a, b) => a.date - b.date);
    let lastKey = null;
    sorted.forEach((img) => {
      const key = img.date.getFullYear() + "-" + img.date.getMonth();
      if (key !== lastKey) {
        const label = document.createElement("div");
        label.className = "timeline-label";
        label.textContent = img.date.toLocaleString("default", { month: "short", year: "2-digit" });
        container.appendChild(label);
        lastKey = key;
      }
      const baseH = 90 + img.significance * 90;
      const w = Math.round(baseH * (img.w / img.h));
      const el = makeCard(img);
      el.style.height = baseH + "px";
      el.style.width = w + "px";
      container.appendChild(el);
    });
  }

  function renderCanvas() {
    const canvas = document.getElementById("canvas");
    canvas.innerHTML = "";
    canvas.style.height = "";
    canvas.className = "canvas mode-" + state.mode;

    const imgs = filteredImages();
    updateHeader(imgs.length);

    if (state.mode === "wander") layoutWander(canvas, imgs);
    else if (state.mode === "optimize") layoutOptimize(canvas, imgs);
    else if (state.mode === "color") layoutColor(canvas, imgs);
    else if (state.mode === "timeline") layoutTimeline(canvas, imgs);
  }

  // ---------- metadata panel ----------

  function showMeta(img) {
    if (!document.getElementById("isolation").hidden) return;
    const panel = document.getElementById("meta-panel");
    panel.hidden = false;
    document.getElementById("meta-primary").textContent = img.code;
    document.getElementById("meta-date").textContent = img.dateLabel;
    document.getElementById("meta-source").textContent = img.source;
    document.getElementById("meta-location").textContent = img.location;
    document.getElementById("meta-dims").textContent = img.dims;
  }

  function hideMeta() {
    if (!document.getElementById("isolation").hidden) return;
    document.getElementById("meta-panel").hidden = true;
  }

  // ---------- isolation view ----------

  function computeAssociations(img) {
    const pool = images.filter((i) => i.id !== img.id);
    const notInTrail = pool.filter((i) => !state.trail.includes(i.id));
    const source = notInTrail.length ? notInTrail : pool;

    const byColor = pickBest(source, (i) => hueDist(i.hue, img.hue), false);

    const moodPool = source.filter((i) => i.mood === img.mood && (!byColor || i.id !== byColor.id));
    const byMood = moodPool.length ? moodPool[Math.floor(Math.random() * moodPool.length)] : null;

    const usedSoFar = [byColor, byMood].filter(Boolean).map((i) => i.id);
    const subjPool = source.filter((i) => i.subject === img.subject && !usedSoFar.includes(i.id));
    const bySubject = subjPool.length ? subjPool[Math.floor(Math.random() * subjPool.length)] : null;

    const usedAll = [byColor, byMood, bySubject].filter(Boolean).map((i) => i.id);
    const timePool = source.filter((i) => !usedAll.includes(i.id));
    const byTime = pickBest(timePool.length ? timePool : source, (i) => Math.abs(i.date - img.date), false);

    return [
      { label: "same color", image: byColor },
      { label: "same mood — " + img.mood, image: byMood },
      { label: "same subject — " + img.subject, image: bySubject },
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
      dot.style.background = colorCss(im);
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

    assoc.forEach((p, i) => {
      const target = i % 2 === 0 ? left : right;
      const btn = document.createElement("button");
      btn.className = "path-btn";
      btn.innerHTML = `<span class="path-thumb" style="background:${colorCss(p.image)}"></span><span class="path-label">${p.label}</span>`;
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
    stage.style.background = colorCss(img);

    const aspect = img.w / img.h;
    const maxW = Math.min(window.innerWidth * 0.5, 520);
    const maxH = Math.min(window.innerHeight * 0.56, 480);
    let dispW = Math.min(420, maxW);
    let dispH = dispW / aspect;
    if (dispH > maxH) { dispH = maxH; dispW = dispH * aspect; }
    if (dispW > maxW) { dispW = maxW; dispH = dispW / aspect; }
    stage.style.width = dispW + "px";
    stage.style.height = dispH + "px";

    document.getElementById("isolation-meta").innerHTML = `
      <div class="meta-primary">${img.code}</div>
      <div class="meta-grid">
        <div class="meta-field"><span class="meta-key">date</span><span class="meta-val">${img.dateLabel}</span></div>
        <div class="meta-field"><span class="meta-key">from</span><span class="meta-val">${img.source}</span></div>
        <div class="meta-field"><span class="meta-key">where</span><span class="meta-val">${img.location}</span></div>
        <div class="meta-field"><span class="meta-key">size</span><span class="meta-val">${img.dims}</span></div>
      </div>`;

    renderTrail();
    renderPaths(img);
  }

  function openIsolation(img) {
    state.trail = [img.id];
    state.isolatedId = img.id;
    document.getElementById("isolation").hidden = false;
    document.getElementById("meta-panel").hidden = true;
    renderIsolation(img);
  }

  function closeIsolation() {
    document.getElementById("isolation").hidden = true;
    state.trail = [];
    state.isolatedId = null;
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

  function init() {
    renderSidebar();
    updateNavActive();
    updateModeActive();
    renderCanvas();

    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });

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

    window.addEventListener("resize", debounce(() => {
      if (state.mode === "wander") renderCanvas();
    }, 200));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
