/* Orquesta filtros, KPI, gráficos y tabla sobre una sola fuente. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var pack = { records: [], source: "demo", sheets: [], generatedAt: "" };
  var filtered = [];
  var agg = null;
  var busy = false;
  var lastFilterKey = "";

  function $(id) { return document.getElementById(id); }
  function setStatus(text, kind) {
    var el = $("src-status");
    if (!el) return;
    el.textContent = text;
    el.className = "src-status" + (kind ? " " + kind : "");
  }
  function setPlanillaStatus(text, kind) {
    var el = $("planilla-status");
    if (!el) return;
    el.textContent = text;
    el.className = "src-status" + (kind ? " " + kind : "");
  }
  function setLoading(on, text) {
    var el = $("loading");
    if (!el) return;
    el.hidden = !on;
    var t = $("loading-text");
    if (t && text) t.textContent = text;
  }
  function filterLabel() {
    var f = QBE.filters.current();
    var bits = [];
    function one(id, label) {
      var el = $(id);
      if (!el || !el.value || el.value === "*") return;
      bits.push(label + " " + el.options[el.selectedIndex].text);
    }
    one("f-anio", "Año");
    one("f-mes", "Mes");
    one("f-semana", "Semana");
    one("f-area", "Área");
    if (f.q) bits.push('Búsqueda "' + f.q + '"');
    return bits.length ? bits.join(" · ") : "Todos los registros";
  }

  function usePack(next, source) {
    pack = {
      records: (next && next.records) || [],
      source: source || (next && next.source) || "api",
      sheets: (next && next.sheets) || [],
      generatedAt: (next && next.generatedAt) || "",
      fileName: (next && next.fileName) || pack.fileName || "",
      demo: source === "demo",
    };
    QBE.perf.cacheClear();
    QBE.filters.render(QBE.data.optionsFrom(pack.records));
    QBE.table.resetPage();
    refresh();
    persist();
    var n = pack.records.length;
    var extra = pack.sheets.length ? " · " + pack.sheets.length + " hoja" + (pack.sheets.length === 1 ? "" : "s") : "";
    if (source === "demo") {
      setStatus("Datos de ejemplo. Cargue el Excel de planilla para ver información real.", "demo");
      setPlanillaStatus("Todavía no hay una planilla local.", "");
    } else if (source === "excel") {
      setStatus("Planilla local · " + n.toLocaleString("es-PE") + " registros" + extra, "ok");
      setPlanillaStatus("Guardada en este equipo" + (pack.fileName ? " · " + pack.fileName : "") + " · " + n.toLocaleString("es-PE") + " registros.", "ok");
    } else {
      setStatus("Planilla actualizada · " + n.toLocaleString("es-PE") + " registros" + extra, "ok");
    }
    var banner = $("demo-banner");
    if (banner) banner.hidden = source !== "demo";
  }

  function persist() {
    if (pack.source === "demo") return;
    QBE.perf.lsSet(QBE.config.cacheKey, {
      records: pack.records,
      source: pack.source,
      sheets: pack.sheets,
      generatedAt: pack.generatedAt,
      fileName: pack.fileName || "",
    });
  }

  function refresh() {
    if (busy) return;
    busy = true;
    var t0 = QBE.perf.nowMs();
    try {
      var f = QBE.filters.current();
      filtered = QBE.data.filterRecords(pack.records, f);
      agg = QBE.data.aggregate(filtered);
      try { QBE.kpis.render(agg.kpis); } catch (e1) {}
      try { QBE.charts.update(agg); } catch (e2) {}
      try { QBE.table.render(filtered); } catch (e3) {}
      var chip = $("detalle-chip");
      if (chip) chip.textContent = "Filtros: " + filterLabel() + ". Exporte a Excel o PDF.";
    } finally {
      busy = false;
    }
    var ms = Math.round(QBE.perf.nowMs() - t0);
    var stamp = $("perf-stamp");
    if (stamp) stamp.textContent = filtered.length.toLocaleString("es-PE") + " filas · " + ms + " ms";
  }

  function refreshTable() {
    if (!agg) return refresh();
    QBE.table.render(filtered);
  }

  function onFilter() {
    QBE.table.resetPage();
    refresh();
    var key = filterLabel();
    if (key !== lastFilterKey) {
      lastFilterKey = key;
      if (QBE.audit) QBE.audit.add("Filtro", key);
    }
  }

  function readExcel(file) {
    return new Promise(function (resolve, reject) {
      if (typeof XLSX === "undefined") return reject(new Error("No se cargó el lector de Excel."));
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
          var parsed = QBE.parser.parseWorkbook(wb);
          parsed.fileName = file && file.name;
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(new Error("No se pudo leer el archivo.")); };
      reader.readAsArrayBuffer(file);
    });
  }

  function ingestExcel(file) {
    if (!file) return;
    setLoading(true, "Analizando planilla…");
    readExcel(file).then(function (parsed) {
      usePack(parsed, "excel");
      if (QBE.audit) QBE.audit.add("Cargar planilla local", (file.name || "Excel") + " · " + ((parsed.records || []).length) + " registros");
      if (QBE.shell && QBE.shell.toast) QBE.shell.toast("Planilla guardada en este equipo");
    }).catch(function (err) {
      setStatus((err && err.message) || "No se pudo leer el Excel.", "err");
      setPlanillaStatus((err && err.message) || "No se pudo leer el Excel.", "err");
    }).finally(function () {
      setLoading(false);
      var fileEl = $("excel-file");
      if (fileEl) fileEl.value = "";
    });
  }

  function boot() {
    QBE.filters.bind(onFilter);
    QBE.table.bind();
    if (QBE.audit) QBE.audit.bind();
    window.addEventListener("resize", QBE.perf.debounce(function () { QBE.charts.resize(); }, 120, "resize"));

    var file = $("excel-file");
    var drop = $("excel-drop");
    if (file) {
      file.addEventListener("change", function () {
        ingestExcel(file.files && file.files[0]);
      });
    }
    if (drop && file) {
      drop.addEventListener("click", function () { file.click(); });
      drop.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); }
      });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("on"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("on"); });
      drop.addEventListener("drop", function (e) {
        e.preventDefault();
        drop.classList.remove("on");
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        ingestExcel(f);
      });
    }
    var reload = $("btn-reload");
    if (reload) reload.addEventListener("click", function () { QBE.app.reload(); });

    var cached = QBE.perf.lsGet(QBE.config.cacheKey);
    try {
      if (cached && cached.records && cached.records.length && cached.source !== "demo") {
        usePack(cached, cached.source);
      } else {
        usePack({ records: QBE.data.buildDemo(), sheets: [{ name: "DEMO", filas: 0 }] }, "demo");
      }
    } catch (err) {
      setStatus((err && err.message) || "No se pudo iniciar el dashboard.", "err");
    }
    setLoading(false);
    if (pack.source !== "excel") loadRemote();
  }

  function spinRefresh(on) {
    var btn = $("refresh-btn");
    if (btn) {
      btn.classList.toggle("is-spin", !!on);
      btn.disabled = !!on;
    }
  }

  function loadRemote() {
    if (!QBE.api.url() || pack.source === "excel") {
      spinRefresh(false);
      return Promise.resolve();
    }
    setLoading(true, "Leyendo planilla en línea…");
    return QBE.api.loadHe().then(function (data) {
      if (!data || pack.source === "excel") return;
      var records = data.records || [];
      if (!records.length && pack.source !== "demo") return;
      if (records.length) {
        usePack(data, "api");
        if (QBE.audit) QBE.audit.add("Actualizar en línea", records.length + " registros");
        if (QBE.shell && QBE.shell.toast) QBE.shell.toast("Planilla actualizada");
      } else setStatus("La planilla en línea no tiene filas de horas extras todavía.", "warn");
    }).catch(function () {
      if (pack.source === "demo") setStatus("No se pudo actualizar en línea. Cargue el Excel en Cargar planilla.", "warn");
      if (QBE.shell && QBE.shell.toast) QBE.shell.toast("No se pudo actualizar en línea", true);
    }).finally(function () {
      setLoading(false);
      spinRefresh(false);
    });
  }

  function reload() {
    refresh();
    if (pack.source === "excel") {
      if (QBE.shell && QBE.shell.toast) QBE.shell.toast("Usando la planilla guardada en este equipo");
      if (QBE.audit) QBE.audit.add("Actualizar", "Planilla local");
      return;
    }
    if (!QBE.api.url()) {
      if (QBE.shell && QBE.shell.toast) QBE.shell.toast("Vista actualizada");
      if (QBE.audit) QBE.audit.add("Actualizar", "Vista local");
      return;
    }
    spinRefresh(true);
    loadRemote();
  }

  QBE.app = {
    boot: boot,
    refresh: refresh,
    refreshTable: refreshTable,
    onFilter: onFilter,
    reload: reload,
    pickExcel: function () {
      var file = $("excel-file");
      if (file) file.click();
    },
    pack: function () { return pack; },
  };
})(typeof window !== "undefined" ? window : globalThis);
