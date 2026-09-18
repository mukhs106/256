/* ------------------------------------------------------------------
   modes-config.js
   EDIT ME — maps each of the six nav symbols (symbols/1.svg..6.svg,
   left to right as they appear in index.html) to a behavior. There are
   two kinds, each with its own config object below, since they work
   differently:

   MODE_CONFIG maps a symbol to a mode id registered by one of the
   files in js/modes/ via ModeManager — a persistent lens that stays
   "on" (and shows the symbol's active indicator) until the same symbol
   is clicked again or another mode symbol is chosen. Good for anything
   that changes how the archive behaves for as long as it's active.

   SYMBOL_FX_CONFIG maps a symbol to a key on window.SymbolFX, an
   instant one-shot trigger registered by one of the files in
   js/effects/ — fires once per click and never sets an active
   indicator or touches mode state, since nothing about it stays "on".
   Good for a brief effect that plays out and finishes on its own.

   A symbol should only appear with a real value in one of the two
   objects below (app.js checks SYMBOL_FX_CONFIG first) — set the value
   to null in whichever one doesn't apply, or in both to leave a symbol
   reserved/unused, in which case activating it just clears whatever
   mode was active and returns to the plain archive.
------------------------------------------------------------------- */
window.MODE_CONFIG = {
  symbol_1: null, // instant effect instead — see SYMBOL_FX_CONFIG
  symbol_2: "cursorTrail", // stays active for as long as the symbol is selected — see js/modes/cursor-trail.js
  symbol_3: "rain",
  symbol_4: "duplicates",
  symbol_5: "magnet",
  symbol_6: "drift",
};

window.SYMBOL_FX_CONFIG = {
  symbol_1: "earthquake",
  symbol_2: null, // persistent mode instead — see MODE_CONFIG
  symbol_3: null,
  symbol_4: null,
  symbol_5: null,
  symbol_6: null,
};
