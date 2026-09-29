// App state persistence. Edits live in localStorage under a versioned key;
// a browser with nothing saved (or an older version) starts from the seed.
(function (root) {
  "use strict";

  // Bumping SEED.version moves to a new key, so saved edits from an older seed are ignored.
  const KEY = "sandune-monitor.state.v" + root.SEED.version;

  function fromSeed() {
    return JSON.parse(JSON.stringify(root.SEED));
  }

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (raw) {
        const state = JSON.parse(raw);
        if (state && state.version === root.SEED.version && Array.isArray(state.holdings) && Array.isArray(state.investments)) return state;
      }
    } catch (e) { /* storage blocked or corrupt: fall through to the seed */ }
    return fromSeed();
  }

  function save(state) {
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* not persisted; app still works */ }
  }

  function reset() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    return fromSeed();
  }

  root.Store = { KEY, load, save, reset };
})(window);
