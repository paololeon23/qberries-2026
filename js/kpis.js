/* KPIs: total HE, costo y colaboradores. Animación suave sin trabar el hilo. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var running = {};

  function fmtHours(n) {
    return Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
  }
  function fmtMoney(n) {
    return "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(n) {
    return Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
  }

  function animate(id, from, to, formatter, ms) {
    var el = document.getElementById(id);
    if (!el) return;
    var reduce = false;
    try { reduce = root.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (err) {}
    if (reduce || Math.abs(to - from) < 0.009) {
      el.textContent = formatter(to);
      return;
    }
    if (running[id]) QBE.perf.caf(running[id]);
    var start = QBE.perf.nowMs();
    ms = ms || 420;
    function step(now) {
      var t = Math.min(1, (now - start) / ms);
      var e = 1 - Math.pow(1 - t, 3);
      var val = from + (to - from) * e;
      el.textContent = formatter(val);
      if (t < 1) running[id] = QBE.perf.raf(step);
      else {
        el.textContent = formatter(to);
        running[id] = 0;
      }
    }
    running[id] = QBE.perf.raf(step);
  }

  var last = { totalHrs: 0, totalImp: 0, colaboradores: 0 };

  function render(kpis) {
    kpis = kpis || { totalHrs: 0, totalImp: 0, colaboradores: 0 };
    animate("kpi-hrs", last.totalHrs, kpis.totalHrs, fmtHours);
    animate("kpi-imp", last.totalImp, kpis.totalImp, fmtMoney);
    animate("kpi-colab", last.colaboradores, kpis.colaboradores, fmtInt);
    last = { totalHrs: kpis.totalHrs, totalImp: kpis.totalImp, colaboradores: kpis.colaboradores };
  }

  QBE.kpis = {
    render: render,
    fmtHours: fmtHours,
    fmtMoney: fmtMoney,
    fmtInt: fmtInt,
  };
})(typeof window !== "undefined" ? window : globalThis);
