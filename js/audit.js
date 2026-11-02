/* Registro de movimientos del sistema. Se guarda solo en este equipo. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var KEY = "qbe.he.audit";
  var MAX = 400;
  var SIZE = 15;
  var page = 1;

  function userName() {
    var s = QBE.auth && QBE.auth.session && QBE.auth.session();
    return (s && (s.nombre || s.usuario)) || "Administrador";
  }
  function nowLabel() {
    try {
      return new Date().toLocaleString("es-PE", {
        timeZone: (QBE.config && QBE.config.tz) || "America/Lima",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch (err) {
      return new Date().toLocaleString("es-PE");
    }
  }
  function load() {
    var rows = QBE.perf.lsGet(KEY);
    return Array.isArray(rows) ? rows : [];
  }
  function save(rows) {
    QBE.perf.lsSet(KEY, rows.slice(0, MAX));
  }
  function add(accion, detalle) {
    var rows = load();
    rows.unshift({
      at: Date.now(),
      cuando: nowLabel(),
      usuario: userName(),
      accion: String(accion || "Movimiento"),
      detalle: String(detalle || ""),
    });
    save(rows);
    if (document.getElementById("audit-body")) render();
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function render() {
    var body = document.getElementById("audit-body");
    var pager = document.getElementById("audit-pager");
    var count = document.getElementById("audit-count");
    if (!body) return;
    var rows = load();
    var pages = Math.max(1, Math.ceil(rows.length / SIZE));
    if (page > pages) page = pages;
    if (page < 1) page = 1;
    var from = (page - 1) * SIZE;
    var slice = rows.slice(from, from + SIZE);
    if (!slice.length) {
      body.innerHTML = '<tr class="empty"><td colspan="4">Todavía no hay movimientos registrados.</td></tr>';
    } else {
      body.innerHTML = slice.map(function (r) {
        return "<tr><td>" + esc(r.cuando) + "</td><td>" + esc(r.usuario) + "</td><td>" + esc(r.accion) + "</td><td>" + esc(r.detalle) + "</td></tr>";
      }).join("");
    }
    if (count) count.textContent = rows.length.toLocaleString("es-PE") + " movimiento" + (rows.length === 1 ? "" : "s");
    if (pager) {
      pager.innerHTML = '<button type="button" data-pg="-1" ' + (page <= 1 ? "disabled" : "") + ">‹</button>" +
        "<span>Página " + page + " de " + pages + "</span>" +
        '<button type="button" data-pg="1" ' + (page >= pages ? "disabled" : "") + ">›</button>";
    }
  }
  function bind() {
    var pager = document.getElementById("audit-pager");
    if (!pager || pager.getAttribute("data-bound")) return;
    pager.setAttribute("data-bound", "1");
    pager.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      page += Number(btn.getAttribute("data-pg") || 0);
      if (page < 1) page = 1;
      render();
    });
  }

  QBE.audit = { add: add, render: render, bind: bind, load: load };
})(typeof window !== "undefined" ? window : globalThis);
