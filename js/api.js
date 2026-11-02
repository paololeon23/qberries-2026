/* GET preciso a Google Apps Script. Sin inventar campos: entrega lo que devuelve el servidor. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});

  function apiUrl() {
    return String((QBE.config && QBE.config.apiUrl) || "").trim();
  }
  function online() {
    try { if (navigator && navigator.onLine === false) return false; } catch (err) {}
    return true;
  }
  function fetchJson(url, timeout) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout || 25000);
    return fetch(url, { method: "GET", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        return res.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (err) {}
          if (!res.ok) throw { status: res.status, message: "No se pudo leer la planilla." };
          return data;
        });
      })
      .finally(function () { clearTimeout(timer); });
  }
  function post(action, payload) {
    var url = apiUrl();
    if (!url) return Promise.reject({ message: "Falta configurar la conexión de la planilla." });
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, QBE.config.timeoutMs || 25000);
    return fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload || {} }),
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      return res.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (err) {}
        if (!res.ok || (data && data.ok === false)) {
          throw { message: (data && data.message) || "No se pudo completar." };
        }
        return data;
      });
    }).finally(function () { clearTimeout(timer); });
  }
  function login(payload) {
    return post("login", payload);
  }
  function loadHe() {
    var url = apiUrl();
    if (!url || !online()) return Promise.resolve(null);
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    function ok(data) {
      if (!data || data.ok === false) throw { message: (data && data.message) || "El servidor no devolvió horas extras." };
      return data;
    }
    return fetchJson(url + sep + "action=he&fresh=1&_=" + Date.now(), QBE.config.timeoutMs).then(ok).catch(function () {
      return post("he", {}).then(ok);
    });
  }

  QBE.api = { url: apiUrl, loadHe: loadHe, login: login, online: online };
})(typeof window !== "undefined" ? window : globalThis);
