/* ------------------------------------------------------------------
   mode-manager.js
   The mode system's engine. Knows nothing about any specific mode or
   about photos/canvases/layout — it only knows how to register modes,
   switch between them cleanly, and hand each mode a scoped toolkit for
   adding things it promises to undo again.

   Concepts:
     - A "mode" is `{ label, enter(ctx), exit(ctx) }` registered under
       an id via ModeManager.register(id, mode). enter/exit are both
       optional.
     - `ModeManager.configure(archiveApi)` hands the manager the app's
       read/hook surface (see app.js's ArchiveAPI) once, at startup.
     - `ModeManager.activate(id)` switches to that mode. It always tears
       down whatever was active first (running its exit(), then
       auto-cleanup), resets the archive to its base rendering via
       archiveApi.resetView(), and only then calls the new mode's
       enter(). Passing null/undefined switches to "no mode" — the
       plain archive with no interaction lens on top.
     - Each activation gets a fresh `ctx` with a matching `scratch`
       object for that mode's own temporary state, plus helpers
       (on/addTempNode/addClass/loop/interval/timeout) that record
       what they did so it can all be undone automatically on the next
       switch. A mode never needs its own teardown bookkeeping for
       things added through ctx — only exit() logic that isn't already
       covered by ctx (e.g. handing data back, if a later mode ever
       needs to).

   This file has nothing to edit for a new mode — see js/modes-config.js
   to map a symbol to a mode id, and js/modes/*.js to define one.
------------------------------------------------------------------- */

(function () {
  let api = null; // the ArchiveAPI, set once via configure()
  const registry = {}; // modeId -> { label, enter, exit }
  let activeId = null;
  let activeCtx = null;

  function configure(archiveApi) {
    api = archiveApi;
  }

  function register(id, mode) {
    registry[id] = mode || {};
  }

  function isRegistered(id) {
    return Object.prototype.hasOwnProperty.call(registry, id);
  }

  function getActiveId() {
    return activeId;
  }

  // Builds a fresh, single-activation toolkit. Everything added through
  // it is undone, in reverse order, by _runCleanup() — that's the only
  // thing that makes mode switching safe to do casually and often.
  function makeCtx() {
    const cleanups = [];

    return {
      archive: api,
      scratch: {}, // this mode's own temporary state; discarded on exit, never touches archive data

      on(target, type, handler, opts) {
        target.addEventListener(type, handler, opts);
        cleanups.push(() => target.removeEventListener(type, handler, opts));
      },

      addTempNode(el, parent) {
        (parent || (api && api.getCanvasEl())).appendChild(el);
        cleanups.push(() => el.remove());
        return el;
      },

      addClass(el, cls) {
        el.classList.add(cls);
        cleanups.push(() => el.classList.remove(cls));
      },

      loop(fn) {
        let raf = requestAnimationFrame(function step(t) {
          fn(t);
          raf = requestAnimationFrame(step);
        });
        cleanups.push(() => cancelAnimationFrame(raf));
      },

      interval(fn, ms) {
        const id = setInterval(fn, ms);
        cleanups.push(() => clearInterval(id));
      },

      timeout(fn, ms) {
        const id = setTimeout(fn, ms);
        cleanups.push(() => clearTimeout(id));
      },

      _runCleanup() {
        while (cleanups.length) {
          try { cleanups.pop()(); } catch (e) { console.error("[mode cleanup]", e); }
        }
      },
    };
  }

  function activate(id) {
    if (!api) return; // configure() hasn't run yet
    const nextId = id || null;
    if (nextId === activeId) return;

    if (activeCtx) {
      const prev = registry[activeId];
      if (prev && typeof prev.exit === "function") {
        try { prev.exit(activeCtx); } catch (e) { console.error("[mode:" + activeId + "] exit failed", e); }
      }
      activeCtx._runCleanup();
      activeCtx = null;
    }

    activeId = nextId;
    document.body.dataset.mode = activeId || "";

    // Always return the archive to its plain, data-driven state before
    // the next mode (if any) builds on top of it — this is what makes
    // "switch symbols to reset" true regardless of what the previous
    // mode did to the DOM.
    api.resetView();

    const next = activeId && registry[activeId];
    if (next) {
      activeCtx = makeCtx();
      if (typeof next.enter === "function") {
        try { next.enter(activeCtx); } catch (e) { console.error("[mode:" + activeId + "] enter failed", e); }
      }
    }
  }

  function deactivateAll() {
    activate(null);
  }

  window.ModeManager = { configure, register, isRegistered, activate, deactivateAll, getActiveId };
})();
