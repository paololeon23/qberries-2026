/* Filtros AÑO / MES / SEMANA / ÁREA. Trabajan juntos sobre la misma fuente. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});

  function readSelect(id) {
    var el = document.getElementById(id);
    if (!el) return [];
    var val = String(el.value || "");
    if (!val || val === "*" || val === "todas" || val === "todos") return [];
    if (id === "f-area") return [val];
    var n = Number(val);
    return isFinite(n) && n ? [n] : [];
  }

  function fillSelect(id, items, formatter, placeholder) {
    var el = document.getElementById(id);
    if (!el) return;
    var prev = el.value;
    var html = '<option value="*">' + placeholder + "</option>";
    (items || []).forEach(function (it) {
      html += '<option value="' + String(it).replace(/"/g, "&quot;") + '">' + formatter(it) + "</option>";
    });
    el.innerHTML = html;
    if (prev && Array.prototype.some.call(el.options, function (o) { return o.value === prev; })) {
      el.value = prev;
    } else {
      el.value = "*";
    }
  }

  function searchValue() {
    var a = document.getElementById("q-table");
    var b = document.getElementById("q-detalle");
    var c = document.getElementById("q");
    return String((a && a.value) || (b && b.value) || (c && c.value) || "").trim();
  }
  function current() {
    return {
      anio: readSelect("f-anio"),
      mes: readSelect("f-mes"),
      semana: readSelect("f-semana"),
      area: readSelect("f-area"),
      q: searchValue(),
    };
  }

  function render(options) {
    var P = QBE.parser;
    fillSelect("f-anio", options.anios, function (y) { return String(y); }, "Todas");
    fillSelect("f-mes", options.meses, function (m) { return P.mesNombre(m); }, "Todas");
    fillSelect("f-semana", options.semanas, function (s) { return String(s); }, "Todas");
    fillSelect("f-area", options.areas, function (a) { return a; }, "Todas");
  }

  function bind(onChange) {
    ["f-anio", "f-mes", "f-semana", "f-area"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", onChange);
    });
    ["q-table", "q-detalle"].forEach(function (id) {
      var q = document.getElementById(id);
      if (!q) return;
      q.addEventListener("input", QBE.perf.debounce(function () {
        ["q-table", "q-detalle", "q"].forEach(function (other) {
          var el = document.getElementById(other);
          if (el && el !== q) el.value = q.value;
        });
        onChange();
      }, 180, "search"));
    });
  }

  QBE.filters = {
    current: current,
    render: render,
    bind: bind,
  };
})(typeof window !== "undefined" ? window : globalThis);
