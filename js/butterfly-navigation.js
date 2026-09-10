/* ------------------------------------------------------------------
   butterfly-navigation.js
   ------------------------------------------------------------------
   Self-contained ButterflyNavigation module.

   Adds a small animated creature that travels between specific photo
   cards on the page, along a curved path, landing/pausing briefly at
   each one before moving on. It lives in its own fixed,
   pointer-events:none layer above the photo canvas, never reads or
   writes any existing app state, and never affects page layout.

   Configuration lives entirely in js/butterfly-config.js — this file
   only expects window.ButterflyConfig to exist (see that file for the
   full list of options).

   Integration point: the only thing this module depends on from the
   rest of the app is the `data-id` attribute that js/app.js already
   puts on every .photo-card element (see makeCard() there). Nothing
   in app.js or data.js needs to change for this to work, and photo
   cards can be freely re-rendered (shuffle, collection switch, resize)
   — this module always re-reads live positions rather than caching
   pixel coordinates.
------------------------------------------------------------------- */

(function () {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    creature: "butterfly",
    connections: [],
    speed: 260,
    minFlightMs: 900,
    maxFlightMs: 3200,
    pauseMs: 1800,
    curvature: 0.4,
    size: 34,
    startDelayMs: 1200,
    zIndex: 90,
    loop: true,
  };

  function mergeConfig(userConfig) {
    const cfg = Object.assign({}, DEFAULTS, userConfig || {});
    cfg.connections = Array.isArray(cfg.connections) ? cfg.connections.slice() : [];
    return cfg;
  }

  function cssEscape(id) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(id);
    return String(id).replace(/["\\]/g, "\\$&");
  }

  // Locates an image's element purely via its stable data-id attribute
  // (already set by js/app.js's makeCard()). Falls back to a couple of
  // other reasonable attributes/ids in case connections ever reference
  // something outside the photo canvas.
  function findImageEl(id) {
    return (
      document.querySelector('.photo-card[data-id="' + cssEscape(id) + '"]') ||
      document.querySelector('[data-image-id="' + cssEscape(id) + '"]') ||
      document.getElementById(id)
    );
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Deterministic per-edge hash so the same "from -> to" pair always
  // bows the same direction (rather than flickering between left/right
  // arcs on every pass), while different edges can still curve
  // differently from one another.
  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h;
  }

  function quadPoint(p0, p1, p2, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    };
  }

  function quadTangent(p0, p1, p2, t) {
    const mt = 1 - t;
    return {
      x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
      y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
    };
  }

  function ButterflyNavigation(userConfig) {
    this.config = mergeConfig(userConfig);
    this.layer = null;
    this.el = null;
    this.connIndex = 0;
    this.pass = 0;
    this.currentNodeId = null;
    this.state = "idle";
    this._raf = null;
    this._pauseTimer = null;
    this._flight = null;
  }

  ButterflyNavigation.prototype.init = function () {
    const cfg = this.config;
    if (!cfg.enabled || !cfg.connections.length) return;

    this.buildLayer();
    this.watchIsolation();

    const self = this;
    setTimeout(function () {
      self.start();
    }, cfg.startDelayMs);
  };

  ButterflyNavigation.prototype.buildLayer = function () {
    const layer = document.createElement("div");
    layer.className = "butterfly-layer";
    layer.style.zIndex = String(this.config.zIndex);
    layer.setAttribute("aria-hidden", "true");

    const creature = document.createElement("div");
    creature.className = "butterfly-creature creature-" + this.config.creature;
    creature.style.setProperty("--butterfly-size", this.config.size + "px");
    creature.innerHTML =
      '<span class="wing wing-l"></span>' +
      '<span class="wing wing-r"></span>' +
      '<span class="body"></span>' +
      '<span class="antenna antenna-l"></span>' +
      '<span class="antenna antenna-r"></span>';

    layer.appendChild(creature);
    document.body.appendChild(layer);

    this.layer = layer;
    this.el = creature;
  };

  // Hides the creature's layer while the existing full-screen isolation
  // view is open, purely by observing that element's `hidden` attribute
  // — no changes to app.js required, and no risk of ever covering it.
  ButterflyNavigation.prototype.watchIsolation = function () {
    const isolation = document.getElementById("isolation");
    if (!isolation || !this.layer || !window.MutationObserver) return;
    const layer = this.layer;
    const sync = function () {
      layer.style.visibility = isolation.hasAttribute("hidden") ? "visible" : "hidden";
    };
    sync();
    new MutationObserver(sync).observe(isolation, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  };

  ButterflyNavigation.prototype.start = function () {
    const self = this;
    const first = this.config.connections[0];
    this.waitForNode(first.from, function (el) {
      const c = centerOf(el);
      self.currentNodeId = first.from;
      self.placeAt(c.x, c.y);
      self.setState("landed");
      self.scheduleNext(self.config.pauseMs);
    });
  };

  // Photo cards can briefly not exist (first load still rendering, or a
  // collection switch that filters the target out) — poll gently for
  // them instead of assuming fixed timing, and give up quietly rather
  // than retrying forever.
  ButterflyNavigation.prototype.waitForNode = function (id, cb, attempts) {
    attempts = attempts || 0;
    const el = findImageEl(id);
    if (el) {
      cb(el);
      return;
    }
    if (attempts > 150) return; // ~15s
    const self = this;
    setTimeout(function () {
      self.waitForNode(id, cb, attempts + 1);
    }, 100);
  };

  ButterflyNavigation.prototype.scheduleNext = function (delay) {
    const self = this;
    clearTimeout(this._pauseTimer);
    this._pauseTimer = setTimeout(function () {
      self.flyNext();
    }, delay);
  };

  ButterflyNavigation.prototype.flyNext = function () {
    const cfg = this.config;
    const conns = cfg.connections;
    if (!conns.length) return;

    if (this.connIndex === 0) {
      this.pass++;
      if (!cfg.loop && this.pass > 1) return; // completed one full pass; stay put
    }

    const conn = conns[this.connIndex];
    this.connIndex = (this.connIndex + 1) % conns.length;

    const self = this;
    const startId = this.currentNodeId || conn.from;
    const targetId = conn.to;

    this.waitForNode(targetId, function (targetEl) {
      const startEl = findImageEl(startId) || targetEl;
      self.flyTo(startId, targetId, startEl, targetEl);
    });
  };

  ButterflyNavigation.prototype.flyTo = function (startId, targetId, startEl, targetEl) {
    const cfg = this.config;
    const p0 = centerOf(startEl);
    const p2 = centerOf(targetEl);
    const dist = Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const duration = Math.max(
      cfg.minFlightMs,
      Math.min(cfg.maxFlightMs, (dist / cfg.speed) * 1000)
    );
    const sign = hashString(startId + ">" + targetId) % 2 === 0 ? 1 : -1;

    this.setState("flying");
    this._flight = {
      startId: startId,
      targetId: targetId,
      sign: sign,
      duration: duration,
      elapsed: 0,
      last: null,
    };

    const self = this;
    this._raf = requestAnimationFrame(function (t) {
      self.stepFlight(t);
    });
  };

  // Positions (and therefore the whole curve) are recomputed from live
  // getBoundingClientRect() calls every frame — never cached as pixel
  // coordinates — so a window resize, page scroll, or re-render of the
  // photo canvas mid-flight is reflected immediately.
  ButterflyNavigation.prototype.stepFlight = function (t) {
    const f = this._flight;
    if (!f) return;
    if (f.last == null) f.last = t;
    f.elapsed += t - f.last;
    f.last = t;

    const startEl = findImageEl(f.startId);
    const targetEl = findImageEl(f.targetId);

    if (!startEl || !targetEl) {
      // One of the two images isn't in the DOM right now (e.g. the
      // visitor switched collections mid-flight). Land in place and
      // retry the route shortly rather than getting stuck.
      this._flight = null;
      this.setState("landed");
      this.scheduleNext(400);
      return;
    }

    const p0 = centerOf(startEl);
    const p2 = centerOf(targetEl);
    const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = len * this.config.curvature * f.sign;
    const p1 = { x: mid.x + nx * offset, y: mid.y + ny * offset };

    const tt = Math.min(1, f.elapsed / f.duration);
    const pos = quadPoint(p0, p1, p2, tt);
    const tan = quadTangent(p0, p1, p2, tt);
    const angle = Math.atan2(tan.y, tan.x) * (180 / Math.PI);

    this.placeAt(pos.x, pos.y, angle);

    if (tt >= 1) {
      this.currentNodeId = f.targetId;
      this._flight = null;
      this.setState("landed");
      this.scheduleNext(this.config.pauseMs);
      return;
    }

    const self = this;
    this._raf = requestAnimationFrame(function (nt) {
      self.stepFlight(nt);
    });
  };

  ButterflyNavigation.prototype.placeAt = function (x, y, angle) {
    if (!this.el) return;
    this.el.style.left = x + "px";
    this.el.style.top = y + "px";
    if (typeof angle === "number") {
      this.el.style.setProperty("--angle", angle + "deg");
    }
  };

  ButterflyNavigation.prototype.setState = function (state) {
    this.state = state;
    if (!this.el) return;
    this.el.classList.toggle("is-flying", state === "flying");
    this.el.classList.toggle("is-landed", state === "landed");
  };

  ButterflyNavigation.prototype.destroy = function () {
    clearTimeout(this._pauseTimer);
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.layer && this.layer.parentNode) this.layer.parentNode.removeChild(this.layer);
  };

  function boot() {
    const nav = new ButterflyNavigation(window.ButterflyConfig);
    nav.init();
    window.ButterflyNavigation = nav; // exposed for debugging only; nothing else reads this
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
