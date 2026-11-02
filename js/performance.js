/* Debounce, rAF, caché y medición. Evita trabajo repetido al filtrar. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var timers = {};
  function raf(fn) {
    if (root.requestAnimationFrame) return root.requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }
  function caf(id) {
    if (root.cancelAnimationFrame) return root.cancelAnimationFrame(id);
    clearTimeout(id);
  }

  function debounce(fn, ms, id) {
    id = id || fn;
    return function () {
      var args = arguments;
      var ctx = this;
      var key = typeof id === "string" ? id : "d";
      if (timers[key]) clearTimeout(timers[key]);
      timers[key] = setTimeout(function () {
        timers[key] = 0;
        fn.apply(ctx, args);
      }, ms);
    };
  }

  function throttleRaf(fn) {
    var scheduled = 0;
    var lastArgs;
    return function () {
      lastArgs = arguments;
      if (scheduled) return;
      scheduled = raf(function () {
        scheduled = 0;
        fn.apply(null, lastArgs);
      });
    };
  }

  var mem = {};
  function cacheGet(key, maxAge) {
    var hit = mem[key];
    if (!hit) return null;
    if (maxAge && Date.now() - hit.at > maxAge) return null;
    return hit.val;
  }
  function cacheSet(key, val) {
    mem[key] = { at: Date.now(), val: val };
    return val;
  }
  function cacheClear() {
    mem = {};
  }

  function lsGet(key) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }
  function lsSet(key, val) {
    try {
      var raw = JSON.stringify(val);
      if (raw.length > 3500000) return false;
      root.localStorage.setItem(key, raw);
      return true;
    } catch (err) {
      return false;
    }
  }

  function nowMs() {
    return (root.performance && performance.now) ? performance.now() : Date.now();
  }

  QBE.perf = {
    debounce: debounce,
    throttleRaf: throttleRaf,
    raf: raf,
    caf: caf,
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    cacheClear: cacheClear,
    lsGet: lsGet,
    lsSet: lsSet,
    nowMs: nowMs,
  };
})(typeof window !== "undefined" ? window : globalThis);
