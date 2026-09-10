/* ------------------------------------------------------------------
   app.js
   Rendering + interaction for the camera-roll prototype.
   Depends on window.APP_DATA from data.js.
------------------------------------------------------------------- */

(function () {
  const { images, collections } = window.APP_DATA;

  const state = {
    collectionId: "all",
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

  function coverFor(collectionId) {
    const member = images.find((im) => im.collections.includes(collectionId));
    return member || images[0];
  }

  // ---------- sidebar ----------

  function renderSidebar() {
    document.getElementById("nav-all-preview").style.background = colorCss(images[0]);
    document.getElementById("nav-all").addEventListener("click", () => selectCollection("all"));

    const nav = document.getElementById("collections-nav");
    nav.innerHTML = '<div class="nav-label">collections</div>';
    collections.forEach((col) => {
      const cover = coverFor(col.id);
      const btn = document.createElement("button");
      btn.className = "nav-item";
      btn.dataset.collection = col.id;
      btn.innerHTML = `<span class="nav-item-preview" style="background:${colorCss(cover)}"></span>
        <span class="nav-item-name">${col.name}</span>`;
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
    updateNavActive();
    renderCanvas();
    closeSidebarOnMobile();
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

  // ---------- layout ----------
  // A single scattered composition: loosely packed, jittered, rotated,
  // sized by each photo's real aspect ratio, with generous breathing
  // room between images and only a rare, slight overlap.

  function layoutWander(container, imgs) {
    const width = container.clientWidth || 900;
    const colWidth = width < 640 ? 210 : width < 1000 ? 260 : 310;
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

      let gap = 70 + Math.random() * 90;
      if (Math.random() < 0.05) gap = -(6 + Math.random() * 22); // rare, slight overlap
      const top = Math.max(0, colHeights[col] + gap);

      const rotation = (Math.random() * 14 - 7).toFixed(1);
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

  // ---------- metadata panel ----------

  function fillMetaFields(prefix, img) {
    document.getElementById(prefix + "-type").textContent = img.type;
    document.getElementById(prefix + "-kept").textContent = img.keptBecause;
    document.getElementById(prefix + "-source").textContent = img.source;
    document.getElementById(prefix + "-when").textContent = img.dateLabel;
    document.getElementById(prefix + "-where").textContent = img.location;
    document.getElementById(prefix + "-returned").textContent = img.returnedTo;
    document.getElementById(prefix + "-connection").textContent = img.connection;
    document.getElementById(prefix + "-still").textContent = img.stillLikeIt;
  }

  function showMeta(img) {
    if (!document.getElementById("isolation").hidden) return;
    const panel = document.getElementById("meta-panel");
    panel.hidden = false;
    document.getElementById("meta-primary").textContent = img.code;
    fillMetaFields("meta", img);
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
        <div class="meta-field"><span class="meta-key">type</span><span class="meta-val" id="iso-type"></span></div>
        <div class="meta-field"><span class="meta-key">kept because</span><span class="meta-val" id="iso-kept"></span></div>
        <div class="meta-field"><span class="meta-key">source</span><span class="meta-val" id="iso-source"></span></div>
        <div class="meta-field"><span class="meta-key">when</span><span class="meta-val" id="iso-when"></span></div>
        <div class="meta-field"><span class="meta-key">where</span><span class="meta-val" id="iso-where"></span></div>
        <div class="meta-field"><span class="meta-key">returned to</span><span class="meta-val" id="iso-returned"></span></div>
        <div class="meta-field"><span class="meta-key">connection</span><span class="meta-val" id="iso-connection"></span></div>
        <div class="meta-field"><span class="meta-key">still like it?</span><span class="meta-val" id="iso-still"></span></div>
      </div>`;
    fillMetaFields("iso", img);

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
    renderCanvas();

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
