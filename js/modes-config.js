/* ------------------------------------------------------------------
   modes-config.js
   EDIT ME — maps each of the six nav symbols (symbols/1.svg..6.svg,
   left to right as they appear in index.html) to a mode id registered
   by one of the files in js/modes/.

   To change which mode a symbol activates, change the value here —
   nothing else in the app needs to know about it. Set a symbol's value
   to null to leave it reserved/unused: activating it just clears
   whatever mode was active and returns to the plain archive.

   Mode ids here must match the id each js/modes/*.js file passes to
   ModeManager.register(id, ...).
------------------------------------------------------------------- */
window.MODE_CONFIG = {
  symbol_1: "just-see-what-happens",
  symbol_2: null, // reserved — not mapped to a mode yet
  symbol_3: "no-point",
  symbol_4: "play-with-the-rules",
  symbol_5: "lose-track-of-time",
  symbol_6: "what-else-could-it-be",
};
