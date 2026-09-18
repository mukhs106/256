/* ------------------------------------------------------------------
   effects/earthquake.js
   symbols/1.svg — an instant trigger, not a mode: clicking it shakes
   the whole canvas (every image moves together, so nothing about their
   positions relative to each other ever changes) and lets go again on
   its own. See js/modes-config.js (SYMBOL_FX_CONFIG) for how a symbol
   gets wired to this.

   The shake itself is one CSS animation (archiveEarthquake in
   style.css) whose 0% and 100% keyframes are both the identity
   transform, so the canvas always settles back exactly where it
   started — this file only ever adds/removes the class that starts it.
------------------------------------------------------------------- */
(function () {
  const DURATION_MS = 1000; // matches archiveEarthquake's animation-duration in style.css

  let removeTimer = null;

  function triggerEarthquake(archive) {
    const canvas = archive && archive.getCanvasEl && archive.getCanvasEl();
    if (!canvas) return;

    canvas.classList.remove("fx-earthquake");
    if (removeTimer) clearTimeout(removeTimer);
    void canvas.offsetWidth; // force a reflow so re-adding the class below restarts the animation even mid-shake

    canvas.classList.add("fx-earthquake");
    removeTimer = setTimeout(() => {
      canvas.classList.remove("fx-earthquake");
      removeTimer = null;
    }, DURATION_MS);
  }

  window.SymbolFX = window.SymbolFX || {};
  window.SymbolFX.earthquake = triggerEarthquake;
})();
