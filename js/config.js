/* QBerries — configuración. La URL de Apps Script se pega en index.html (meta qberries-api). */
(function (root) {
  var DEFAULT_API = "";
  var stored = "";
  try {
    stored = String((root.localStorage && root.localStorage.getItem("qbe.he.apiUrl")) || "");
  } catch (err) {
    stored = "";
  }
  var meta = typeof document !== "undefined" ? document.querySelector('meta[name="qberries-api"]') : null;
  var fromMeta = meta ? String(meta.getAttribute("content") || "").trim() : "";

  root.QBE = root.QBE || {};
  var apiUrl = String(root.QBE_API_URL || fromMeta || stored || DEFAULT_API).trim();
  if (fromMeta && root.localStorage) {
    try { root.localStorage.setItem("qbe.he.apiUrl", fromMeta); } catch (err2) {}
  }
  root.QBE.config = {
    apiUrl: apiUrl,
    timeoutMs: 40000,
    staleMs: 8000,
    retries: 1,
    moneda: "PEN",
    simbolo: "S/",
    empresa: "QBerries",
    pageSize: 80,
    cacheKey: "qbe.he.pack",
    tz: "America/Lima",
    usuario: "Administrador",
    clave: "eduardo2026",
  };
})(typeof window !== "undefined" ? window : globalThis);
