/* Tabla de detalle: orden, búsqueda, paginación y exportación. Sin fila Total. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var state = { key: "nombres", dir: 1, page: 1, size: (QBE.config && QBE.config.pageSize) || 80 };

  var COLS = [
    { key: "dni", label: "DNI" },
    { key: "nombres", label: "APELLIDOS Y NOMBRES" },
    { key: "area", label: "ÁREA" },
    { key: "cargo", label: "CARGO" },
    { key: "mesNombre", label: "MES" },
    { key: "semana", label: "SEMANA" },
    { key: "fechaLarga", label: "F-TRABAJO" },
    { key: "hrs", label: "TOTAL H. E.", num: true },
    { key: "imp", label: "HRS. EXTRAS S/.", num: true },
  ];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtHrs(n) {
    return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtMoney(n) {
    return "S/ " + Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function isTotalRow(r) {
    var n = String((r && r.nombres) || "").toLowerCase().replace(/\s+/g, " ").trim();
    var d = String((r && r.dni) || "").toLowerCase();
    return n === "total" || n === "totales" || n.indexOf("total general") === 0 || d === "total";
  }

  function paintMount(headId, bodyId, pagerId, countId, pageRows, sorted, pages) {
    var body = document.getElementById(bodyId);
    var head = document.getElementById(headId);
    var pager = document.getElementById(pagerId);
    var count = document.getElementById(countId);
    if (!body || !head) return;
    head.innerHTML = COLS.map(function (c) {
      var mark = state.key === c.key ? (state.dir > 0 ? " ▴" : " ▾") : "";
      return '<th data-key="' + c.key + '" class="' + (c.num ? "num" : "") + '">' + c.label + mark + "</th>";
    }).join("");
    if (!pageRows.length) {
      body.innerHTML = '<tr class="empty"><td colspan="9">No hay registros de horas extras para los filtros seleccionados.</td></tr>';
    } else {
      var html = "";
      var i;
      for (i = 0; i < pageRows.length; i += 1) {
        var r = pageRows[i];
        html += "<tr>" +
          "<td>" + esc(r.dni) + "</td>" +
          "<td>" + esc(r.nombres) + "</td>" +
          "<td>" + esc(QBE.data.areaKey(r.area)) + "</td>" +
          "<td>" + esc(r.cargo) + "</td>" +
          "<td>" + esc(r.mesNombre) + "</td>" +
          "<td class=\"num\">" + (r.semana || "") + "</td>" +
          "<td>" + esc(r.fechaLarga || r.fecha || "") + "</td>" +
          "<td class=\"num\">" + fmtHrs(r.hrs) + "</td>" +
          "<td class=\"num\">" + fmtMoney(r.imp) + "</td>" +
          "</tr>";
      }
      body.innerHTML = html;
    }
    if (count) {
      count.textContent = sorted.length.toLocaleString("es-PE") + " registro" + (sorted.length === 1 ? "" : "s");
    }
    if (pager) {
      pager.innerHTML = '<button type="button" data-pg="-1" ' + (state.page <= 1 ? "disabled" : "") + ">‹</button>" +
        "<span>Página " + state.page + " de " + pages + "</span>" +
        '<button type="button" data-pg="1" ' + (state.page >= pages ? "disabled" : "") + ">›</button>";
    }
  }

  function render(rows) {
    var clean = (rows || []).filter(function (r) { return !isTotalRow(r); });
    var sorted = QBE.data.sortRecords(clean, state.key, state.dir);
    var size = state.size;
    var pages = Math.max(1, Math.ceil(sorted.length / size));
    if (state.page > pages) state.page = pages;
    var from = (state.page - 1) * size;
    var pageRows = sorted.slice(from, from + size);
    paintMount("table-head", "table-body", "table-pager", "table-count", pageRows, sorted, pages);
    paintMount("dash-table-head", "dash-table-body", "dash-table-pager", "dash-table-count", pageRows, sorted, pages);
    state._rows = sorted;
  }

  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function exportCsv() {
    var rows = state._rows || [];
    var lines = [COLS.map(function (c) { return c.label; }).join(";")];
    rows.forEach(function (r) {
      lines.push([
        r.dni, r.nombres, QBE.data.areaKey(r.area), r.cargo, r.mesNombre, r.semana,
        r.fechaLarga || r.fecha || "", fmtHrs(r.hrs), fmtMoney(r.imp),
      ].map(csvEscape).join(";"));
    });
    var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "detalle-horas-extras-qberries.csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    if (QBE.audit) QBE.audit.add("Exportar CSV", rows.length + " registros");
  }
  function exportXls() {
    var rows = state._rows || [];
    if (typeof XLSX === "undefined") return exportCsv();
    var aoa = [COLS.map(function (c) { return c.label; })];
    rows.forEach(function (r) {
      aoa.push([r.dni, r.nombres, QBE.data.areaKey(r.area), r.cargo, r.mesNombre, r.semana, r.fechaLarga || r.fecha || "", r.hrs, r.imp]);
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "Detalle HE");
    XLSX.writeFile(wb, "detalle-horas-extras-qberries.xlsx");
    if (QBE.audit) QBE.audit.add("Exportar Excel", rows.length + " registros");
  }
  function exportPdf() {
    var rows = state._rows || [];
    var w = root.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    var body = rows.map(function (r) {
      return "<tr><td>" + esc(r.dni) + "</td><td>" + esc(r.nombres) + "</td><td>" + esc(QBE.data.areaKey(r.area)) +
        "</td><td>" + esc(r.cargo) + "</td><td>" + esc(r.mesNombre) + "</td><td>" + esc(r.semana || "") +
        "</td><td>" + esc(r.fechaLarga || r.fecha || "") + "</td><td>" + fmtHrs(r.hrs) +
        "</td><td>" + fmtMoney(r.imp) + "</td></tr>";
    }).join("");
    w.document.write(
      "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"/><title>Detalle de Horas Extras</title>" +
      "<style>body{font-family:Segoe UI,Calibri,sans-serif;color:#1b1f24;padding:18px}h1{font-size:18px;margin:0 0 12px}" +
      "table{width:100%;border-collapse:collapse;font-size:11px}th{background:#e30613;color:#fff;text-align:left;padding:6px}" +
      "td{border-bottom:1px solid #edf1f4;padding:5px 6px}.num{text-align:right}</style></head><body>" +
      "<h1>QBerries · Detalle de Horas Extras</h1>" +
      "<table><thead><tr>" + COLS.map(function (c) { return "<th>" + c.label + "</th>"; }).join("") +
      "</tr></thead><tbody>" + (body || "<tr><td colspan='9'>Sin registros</td></tr>") +
      "</tbody></table></body></html>"
    );
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (err) {} }, 250);
    if (QBE.audit) QBE.audit.add("Exportar PDF", rows.length + " registros");
  }

  function bind() {
    function onHeadClick(e) {
      var th = e.target.closest("th");
      if (!th || !th.getAttribute("data-key")) return;
      var key = th.getAttribute("data-key");
      if (state.key === key) state.dir *= -1;
      else { state.key = key; state.dir = 1; }
      state.page = 1;
      if (QBE.app && QBE.app.refreshTable) QBE.app.refreshTable();
    }
    function onPagerClick(e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      state.page += Number(btn.getAttribute("data-pg") || 0);
      if (state.page < 1) state.page = 1;
      if (QBE.app && QBE.app.refreshTable) QBE.app.refreshTable();
    }
    ["table-head", "dash-table-head"].forEach(function (id) {
      var head = document.getElementById(id);
      if (head) head.addEventListener("click", onHeadClick);
    });
    ["table-pager", "dash-table-pager"].forEach(function (id) {
      var pager = document.getElementById(id);
      if (pager) pager.addEventListener("click", onPagerClick);
    });
    var csv = document.getElementById("btn-csv");
    var xls = document.getElementById("btn-xls");
    var pdf = document.getElementById("btn-pdf");
    if (csv) csv.addEventListener("click", exportCsv);
    if (xls) xls.addEventListener("click", exportXls);
    if (pdf) pdf.addEventListener("click", exportPdf);
  }

  function resetPage() {
    state.page = 1;
  }

  QBE.table = { render: render, bind: bind, resetPage: resetPage, state: state };
})(typeof window !== "undefined" ? window : globalThis);
