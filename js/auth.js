/* Inicio de sesión de la plantilla. Local si no hay API; si hay Apps Script, valida allí. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var KEY = "qbe.he.panel";
  var session = null;

  function $(id) { return document.getElementById(id); }
  function fold(s) {
    return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function localOk(usuario, clave) {
    return fold(usuario) === fold(QBE.config.usuario) && String(clave) === String(QBE.config.clave);
  }
  function save(row) {
    session = row;
    try { sessionStorage.setItem(KEY, JSON.stringify(row)); } catch (err) {}
  }
  function clear() {
    session = null;
    try { sessionStorage.removeItem(KEY); } catch (err) {}
  }
  function restore() {
    try {
      var raw = sessionStorage.getItem(KEY);
      session = raw ? JSON.parse(raw) : null;
      return !!(session && session.id);
    } catch (err) {
      session = null;
      return false;
    }
  }
  function login(usuario, clave) {
    var payload = { usuario: usuario, clave: clave };
    if (QBE.api && QBE.api.url() && QBE.api.online()) {
      return QBE.api.login(payload).then(function (data) {
        var row = (data && data.data) || data;
        if (!row || !row.id) throw { message: "Usuario o clave incorrectos." };
        save(row);
        return row;
      }).catch(function (err) {
        if (localOk(usuario, clave)) {
          var row = { id: "USR-ADMIN", usuario: QBE.config.usuario, nombre: QBE.config.usuario, rol: "admin" };
          save(row);
          return row;
        }
        throw err;
      });
    }
    return new Promise(function (resolve, reject) {
      if (!localOk(usuario, clave)) {
        reject({ message: "Usuario o clave incorrectos." });
        return;
      }
      var row = { id: "USR-ADMIN", usuario: QBE.config.usuario, nombre: QBE.config.usuario, rol: "admin" };
      save(row);
      resolve(row);
    });
  }
  function showGate() {
    if ($("panel-login")) return;
    var gate = document.createElement("div");
    gate.id = "panel-login";
    gate.className = "panel-login";
    gate.innerHTML =
      '<form class="panel-login-card" id="panel-login-form" autocomplete="off">' +
      '<img class="panel-login-brand" src="assets/logo-qberries.png" alt="QBerries" />' +
      '<p class="panel-login-kicker">QBerries</p>' +
      "<h1>Iniciar sesión</h1>" +
      '<p class="panel-login-lead">Acceso del administrador al control de horas extras.</p>' +
      '<label>Usuario<input id="panel-user" name="usuario" required autocomplete="username" value="Administrador" readonly /></label>' +
      '<label>Clave<input id="panel-pass" type="password" name="clave" required autocomplete="current-password" /></label>' +
      '<p class="panel-login-err" id="panel-login-err" hidden></p>' +
      '<button type="submit" id="panel-login-btn"><span class="panel-login-spin" id="panel-login-spin" hidden></span><span id="panel-login-label">Iniciar sesión</span></button></form>';
    document.body.appendChild(gate);
    $("panel-login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("panel-login-err");
      var btn = $("panel-login-btn");
      var spin = $("panel-login-spin");
      var label = $("panel-login-label");
      btn.disabled = true;
      spin.hidden = false;
      err.hidden = true;
      login("Administrador", $("panel-pass").value)
        .then(function () {
          gate.remove();
          if (QBE.audit) QBE.audit.add("Inicio de sesión", "Acceso al panel");
          if (QBE.shell && QBE.shell.afterLogin) QBE.shell.afterLogin();
        })
        .catch(function (e2) {
          err.hidden = false;
          err.textContent = (e2 && e2.message) || "Usuario o clave incorrectos.";
          btn.disabled = false;
          spin.hidden = true;
          label.textContent = "Iniciar sesión";
        });
    });
    setTimeout(function () {
      var p = $("panel-pass");
      if (p) p.focus();
    }, 30);
  }
  function requireSession() {
    if (restore()) return true;
    showGate();
    return false;
  }

  QBE.auth = {
    login: login,
    logout: clear,
    session: function () { return session; },
    require: requireSession,
    showGate: showGate,
  };
})(typeof window !== "undefined" ? window : globalThis);
