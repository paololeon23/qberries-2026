/**
 * QBerries Horas Extras — Code.gs (archivo único)
 *
 * Pegue SOLO este archivo. Lee la planilla del mismo spreadsheet.
 *
 * 1. Ejecute instalar() una vez y autorice
 * 2. Implementar > Aplicación web > Ejecutar como Yo > Cualquier usuario
 * 3. Copie la URL /exec en index.html (meta qberries-api)
 *
 * Flujo: POST JSON { action, payload } → lock → login | he
 * Lectura: GET /exec?action=he → { ok, records, sheets, generatedAt }
 *
 * NO crea hojas, NO las renombra, NO las borra, NO pinta celdas.
 * Usted pulsa + en Google Sheets. El script SOLO LEE lo que ya está.
 * Junta todas las pestañas, todos los días. Filas repetidas se omiten.
 * No inventa horas ni importes. Filas repetidas se omiten.
 * Encabezados reales del Excel "Reporte Planilla General Detallado":
 *   Apellidos y Nombres, DNI, Fecha Ingreso, Fecha Cese, Cargo, ÁREA, ETAPA, JORNAL
 *   HORAS EXTRAS (Cantidad, Importe), Horas 100% (Cantidad, Importe)
 * Si una hoja trae 25%, 35%, F-TRABAJO, SEMANA o MES, también se leen.
 */

var TZ = "America/Lima";
var APP = "QBerries Horas Extras";
var CACHE_KEY = "QBE_HE_PACK";
var CACHE_TTL = 90;
var USUARIO_ACCESO = "Administrador";
var CLAVE_ACCESO = "eduardo2026";

var MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];

function doGet(e) {
  try {
    var action = String((e && e.parameter && e.parameter.action) || "").toLowerCase();
    if (action === "ping" || !action) return json_({ ok: true, app: APP, tz: TZ });
    if (action === "meta") return json_(meta_());
    return json_(loadPack_());
  } catch (err) {
    return json_({
      ok: false,
      error: "lectura_fallida",
      message: String(err && err.message ? err.message : err),
      records: [],
      sheets: [],
      total: 0,
    });
  }
}

function doPost(e) {
  var body = {};
  try {
    body = parseBody_(e);
  } catch (err) {
    return json_({ ok: false, error: "json_invalido", message: "No se pudo leer la petición." });
  }
  return handle_(String((body && body.action) || ""), body.payload || {});
}

function handle_(action, payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
  } catch (err) {
    return json_({ ok: false, error: "lock_timeout", message: "El servidor está ocupado. Intente de nuevo." });
  }
  try {
    action = String(action || "").toLowerCase();
    if (action === "login") return json_(login_(payload));
    if (action === "he") return json_(loadPack_());
    if (action === "meta") return json_(meta_());
    if (action === "ping" || !action) return json_({ ok: true, app: APP, tz: TZ });
    return json_({ ok: false, error: "accion_desconocida", message: "El servidor no reconoció la petición." });
  } catch (err) {
    return json_({
      ok: false,
      error: "json_invalido",
      message: String(err && err.message ? err.message : err),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (e2) {}
  }
}

function login_(payload) {
  var usuario = String((payload && payload.usuario) || "").replace(/\s+/g, " ").trim().toLowerCase();
  var clave = String((payload && payload.clave) || "");
  if (usuario !== USUARIO_ACCESO.toLowerCase() || clave !== CLAVE_ACCESO) {
    return { ok: false, error: "clave_invalida", message: "Usuario o clave incorrectos." };
  }
    return {
    ok: true,
    data: { id: "USR-ADMIN", usuario: USUARIO_ACCESO, nombre: USUARIO_ACCESO, rol: "admin" },
  };
}

function instalar() {
  var ss = getSpreadsheet();
  ensureTrigger_(ss);
  try { CacheService.getScriptCache().remove(CACHE_KEY); } catch (err) {}
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", ss.getId());
  return ss.getUrl();
}

function onChange(e) {
  onSheetChange_(e);
}

function onSheetChange_(e) {
  try {
    CacheService.getScriptCache().remove(CACHE_KEY);
  } catch (err) {}
  if (!e || e.changeType !== "INSERT_GRID") return;
  try {
    var ss = e.source || SpreadsheetApp.getActive();
    var sh = ss && ss.getActiveSheet ? ss.getActiveSheet() : null;
    if (sh) sheetFecha_(sh, sh.getName(), true);
  } catch (err2) {}
}

function ensureTrigger_(ss) {
  if (typeof ScriptApp === "undefined" || !ScriptApp.getProjectTriggers || !ss) return;
  var fn = "onSheetChange_";
  var list = [];
  try {
    list = ScriptApp.getProjectTriggers() || [];
  } catch (err) {
    return;
  }
  var i;
  for (i = 0; i < list.length; i += 1) {
    try {
      if (list[i].getHandlerFunction() === fn) return;
    } catch (err2) {}
  }
  try {
    ScriptApp.newTrigger(fn).forSpreadsheet(ss).onChange().create();
  } catch (err3) {}
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj || {})).setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return { action: "", payload: {}, session: null };
  return JSON.parse(e.postData.contents);
}

function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = "";
  try { id = props.getProperty("SPREADSHEET_ID") || ""; } catch (err) { id = ""; }
  var ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err2) { ss = null; }
  }
  if (!ss) {
    try { ss = SpreadsheetApp.getActive(); } catch (err3) { ss = null; }
  }
  if (!ss) {
    throw new Error("No hay planilla vinculada. Abra el spreadsheet y ejecute instalar().");
  }
  try { props.setProperty("SPREADSHEET_ID", ss.getId()); } catch (err4) {}
  return ss;
}

function hoyYmd_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}

function sheetFecha_(sh, name, stamp) {
  var fromName = parseSheetPeriod_(name || "").fecha;
  if (fromName) return fromName;
  var key = "";
  try { key = "HOJA_FECHA_" + sh.getSheetId(); } catch (err) { key = ""; }
  if (key) {
    try {
      var hit = PropertiesService.getScriptProperties().getProperty(key);
      if (hit) return hit;
    } catch (err2) {}
  }
  if (!stamp) return "";
  var ymd = hoyYmd_();
  if (key) {
    try { PropertiesService.getScriptProperties().setProperty(key, ymd); } catch (err3) {}
  }
  return ymd;
}

function skipSheetName_(name) {
  var n = String(name || "");
  if (/^config/i.test(n) || /^instrucc/i.test(n)) return true;
  return false;
}

function sanitizeCell_(v) {
  if (v == null || v === "") return "";
  var t = typeof v;
  if (t === "number") return isFinite(v) ? v : 0;
  if (t === "boolean") return v ? 1 : 0;
  if (t === "string") return v;
  if (Object.prototype.toString.call(v) === "[object Date]") return isNaN(v.getTime()) ? "" : v;
  try {
    if (typeof v.getMessage === "function" || v.name === "Error") return "";
  } catch (err) {}
  try { return String(v); } catch (err2) { return ""; }
}

function sanitizeGrid_(grid) {
  var out = [];
  var i, j, row, copy;
  for (i = 0; i < grid.length; i += 1) {
    row = grid[i] || [];
    copy = [];
    for (j = 0; j < row.length; j += 1) copy.push(sanitizeCell_(row[j]));
    out.push(copy);
  }
  return out;
}

function sheetValues_(sh) {
  var last = 0;
  var lastCol = 0;
  try {
    last = Number(sh.getLastRow()) || 0;
    lastCol = Number(sh.getLastColumn()) || 0;
  } catch (err) {
    return [];
  }
  if (last < 1 || lastCol < 1) return [];
  lastCol = Math.min(lastCol, 80);
  var CHUNK = 2500;
  var grid = [];
  var r = 1;
  while (r <= last) {
    var n = Math.min(CHUNK, last - r + 1);
    var part = sh.getRange(r, 1, n, lastCol).getValues();
    var i;
    for (i = 0; i < part.length; i += 1) grid.push(part[i]);
    r += n;
  }
  return sanitizeGrid_(grid);
}

function fingerprint_(rec) {
  return [
    rec.dni, rec.fecha, rec.area, rec.cargo, rec.semana,
    rec.hrsHe, rec.impHe, rec.hrs25, rec.hrs35, rec.hrs100, rec.imp,
  ].join("|");
}

function readOneSheet_(sh) {
  var name = "";
  try { name = String(sh.getName() || ""); } catch (err) { return { skip: true }; }
  if (skipSheetName_(name)) return { skip: true };
  var last = 0;
  try { last = Number(sh.getLastRow()) || 0; } catch (err2) { last = 0; }
  if (name === "PlanillaGeneralDetallado" && last <= 3) {
    return { meta: { name: name, tipo: "plantilla", filas: 0, columnas: [], omitidas: 0 } };
  }
  var values = sheetValues_(sh);
  if (!values.length || values.length < 2) {
    return { meta: { name: name, tipo: "vacia", filas: 0, columnas: [], omitidas: 0 } };
  }
  var parsed;
  try {
    parsed = parseAoA_(values, name, sheetFecha_(sh, name, values.length > 3));
  } catch (errP) {
    return {
      meta: {
        name: name,
        tipo: "error",
        filas: 0,
        columnas: [],
        omitidas: 0,
        error: String(errP && errP.message ? errP.message : errP),
      },
    };
  }
  return {
    meta: {
      name: name,
      tipo: parsed.tipo,
      filas: parsed.records.length,
      columnas: parsed.columnas,
      omitidas: parsed.omitidas,
    },
    records: parsed.records || [],
  };
}

function loadPack_() {
  var ss = getSpreadsheet();
  try { CacheService.getScriptCache().remove(CACHE_KEY); } catch (err0) {}
  var sheets = [];
  try { sheets = ss.getSheets() || []; } catch (err) {
    return { ok: false, error: "lectura_fallida", message: "No se pudieron listar las hojas.", records: [], sheets: [], total: 0 };
  }
  var all = [];
  var meta = [];
  var seen = {};
  var i;
  for (i = 0; i < sheets.length; i += 1) {
    try {
      var one = readOneSheet_(sheets[i]);
      if (one.skip) continue;
      meta.push(one.meta);
      (one.records || []).forEach(function (rec) {
        var fp = fingerprint_(rec);
        if (seen[fp]) return;
        seen[fp] = 1;
        all.push(rec);
      });
    } catch (errSheet) {
      var failed = "hoja";
      try { failed = String(sheets[i].getName() || "hoja"); } catch (errN) {}
      meta.push({
        name: failed,
        tipo: "error",
        filas: 0,
        columnas: [],
        omitidas: 0,
        error: String(errSheet && errSheet.message ? errSheet.message : errSheet),
      });
    }
  }
  return {
    ok: true,
    app: APP,
    records: all,
    sheets: meta,
    generatedAt: Utilities.formatDate(new Date(), TZ, "dd-MM-yyyy HH:mm:ss"),
    total: all.length,
  };
}

function meta_() {
  var pack = loadPack_();
  return {
    ok: true,
    app: APP,
    generatedAt: pack.generatedAt,
    total: pack.total,
    sheets: pack.sheets,
  };
}

function fold_(s) {
  var t = String(s == null ? "" : s).toLowerCase();
  try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (err) {
    t = t.replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n");
  }
  return t.replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim();
}
function pad_(n) {
  n = Number(n) || 0;
  return n < 10 ? "0" + n : String(n);
}
function asText_(v) {
  if (v == null || v === "") return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  }
  return String(v).replace(/\s+/g, " ").trim();
}
function asNumber_(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Object.prototype.toString.call(v) === "[object Date]") return 0;
  var s = String(v).trim();
  if (!s || s.charAt(0) === "#") return 0;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    var p = s.split(":");
    return Number(p[0]) + Number(p[1]) / 60 + Number(p[2] || 0) / 3600;
  }
  s = s.replace(/s\/\.?/gi, "").replace(/\s/g, "");
  if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.indexOf(",") >= 0 && /^\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, "");
  } else if (s.indexOf(",") >= 0) {
    s = s.replace(",", ".");
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function money_(n) {
  var x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}
function hours_(n) {
  return money_(n);
}
function digits_(s) {
  if (typeof s === "number" && isFinite(s)) return String(Math.round(Math.abs(s))).slice(0, 12);
  return String(s == null ? "" : s).replace(/\D/g, "").slice(0, 12);
}
function parseDay_(v) {
  if (v == null || v === "") return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    var d = new Date(Math.round((v - 25569) * 86400000));
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, TZ, "yyyy-MM-dd");
  }
  var s = String(v).trim();
  var iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (iso) return iso[1] + "-" + pad_(iso[2]) + "-" + pad_(iso[3]);
  var pe = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (pe) {
    var y = Number(pe[3]);
    if (y < 100) y += 2000;
    if (Number(pe[1]) <= 31 && Number(pe[2]) <= 12) return y + "-" + pad_(pe[2]) + "-" + pad_(pe[1]);
  }
  return "";
}
function monthIndex_(name) {
  var f = fold_(name);
  var i;
  for (i = 0; i < MESES.length; i += 1) if (fold_(MESES[i]) === f) return i;
  if (f === "septiembre") return 8;
  return -1;
}
function isoWeek_(ymd) {
  if (!ymd) return 0;
  var p = ymd.split("-");
  var date = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  var day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}
function mesNombre_(m) {
  return MESES[(Number(m) || 1) - 1] || "";
}
function fechaLarga_(ymd) {
  if (!ymd) return "";
  var p = ymd.split("-");
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (isNaN(d.getTime())) return ymd;
  var dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return dias[d.getDay()] + ", " + pad_(d.getDate()) + " de " + mesNombre_(d.getMonth() + 1).toLowerCase() + " de " + d.getFullYear();
}
function fillRight_(row) {
  var out = row.slice();
  var last = "";
  var i;
  for (i = 0; i < out.length; i += 1) {
    var t = asText_(out[i]);
    if (t) last = t;
    else if (last) out[i] = last;
  }
  return out;
}
function parseSheetPeriod_(name) {
  var raw = String(name || "");
  var f = fold_(name);
  var out = { anio: 0, mes: 0, semana: 0, fecha: "" };
  var iso = raw.match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  var pe = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (iso) {
    out.anio = Number(iso[1]);
    out.mes = Number(iso[2]);
    out.fecha = iso[1] + "-" + pad_(iso[2]) + "-" + pad_(iso[3]);
  } else if (pe && Number(pe[1]) <= 31 && Number(pe[2]) <= 12) {
    var y = Number(pe[3]);
    if (y < 100) y += 2000;
    out.anio = y;
    out.mes = Number(pe[2]);
    out.fecha = y + "-" + pad_(pe[2]) + "-" + pad_(pe[1]);
  }
  var w = f.match(/semana\s*(\d{1,2})/);
  if (w) out.semana = Number(w[1]);
  if (!out.anio) {
    var y2 = f.match(/(20\d{2})/);
    if (y2) out.anio = Number(y2[1]);
  }
  if (!out.mes) {
    var i;
    for (i = 0; i < MESES.length; i += 1) if (f.indexOf(fold_(MESES[i])) >= 0) out.mes = i + 1;
  }
  if (out.fecha && !out.semana) out.semana = isoWeek_(out.fecha);
  return out;
}
function incomeKind_(group) {
  var g = fold_(group);
  if (!g) return "";
  if (g.indexOf("25") >= 0 && (g.indexOf("hora") >= 0 || g.indexOf("he") >= 0 || g.indexOf("hrs") >= 0 || g.indexOf("%") >= 0)) return "he25";
  if (g.indexOf("35") >= 0 && (g.indexOf("hora") >= 0 || g.indexOf("he") >= 0 || g.indexOf("hrs") >= 0 || g.indexOf("%") >= 0)) return "he35";
  if (g.indexOf("100") >= 0 && (g.indexOf("hora") >= 0 || g.indexOf("he") >= 0 || g.indexOf("hrs") >= 0 || g.indexOf("%") >= 0)) return "he100";
  if (g === "horas extras" || g === "hora extras" || g === "h extras" || g === "hrs extras" || g === "he" || g === "total h e" || g === "total he") return "he";
  if (g.indexOf("hrs extras s") === 0) return "impHeOnly";
  return "";
}
function qtyOrImp_(label) {
  var g = fold_(label);
  if (!g) return "";
  if (g.indexOf("imp") === 0 || g.indexOf("importe") >= 0 || g === "costo" || g.indexOf("s/") === 0 || g.indexOf("hrs extras s") === 0) return "imp";
  if (g === "cantidad" || g === "cant" || g === "horas" || g === "hrs" || g === "total h e" || g === "total he") return "qty";
  return "";
}
function cap_(kind) {
  if (kind === "he") return "He";
  if (kind === "he25") return "25";
  if (kind === "he35") return "35";
  if (kind === "he100") return "100";
  return kind;
}
function findSemanaCol_(row0, row1, row2, width) {
  var c;
  for (c = 0; c < width; c += 1) {
    var f = fold_(row0[c]) + " " + fold_(row1[c]) + " " + fold_(row2[c]);
    if (f.indexOf("semana") >= 0 || f === "sem" || (" " + f + " ").indexOf(" sem ") >= 0) return c;
  }
  if (width >= 26) return 25;
  return null;
}
function weekNum_(v) {
  var n = asNumber_(v);
  if (n >= 1 && n <= 53) return Math.round(n);
  var m = String(v == null ? "" : v).match(/(^|[^\d])(\d{1,2})([^\d]|$)/);
  if (m) {
    n = Number(m[2]);
    if (n >= 1 && n <= 53) return n;
  }
  return 0;
}
function identityKey_(a) {
  if (a === "apellidos y nombres" || a === "trabajador" || a === "nombres y apellidos" || a === "nombre" || a === "apellidos" || a === "nombres") return "nombres";
  if (a === "dni" || a === "documento" || a === "nro documento" || a === "numero documento" || a === "codigo trabajador" || a === "cod trabajador") return "dni";
  if (a === "fecha ingreso" || a === "f ingreso") return "fechaIngreso";
  if (a === "fecha cese" || a === "f cese") return "fechaCese";
  if (a === "cargo" || a === "tipo de planilla") return "cargo";
  if (a === "area" || a === "ceco" || a === "centro de costo") return "area";
  if (a === "etapa") return "etapa";
  if (a === "jornal") return "jornal";
  if (a === "f trabajo" || a === "fecha trabajo" || a === "fecha" || a === "f trabajo" || a === "f-trabajo") return "fecha";
  if (a === "semana" || a === "sem" || a === "nro semana" || a === "numero semana" || a === "semana iso") return "semana";
  if (a === "mes") return "mes";
  if (a === "ano" || a === "anio" || a === "year") return "anio";
  return "";
}

function buildColumnMap_(rows) {
  var maxScan = Math.min(rows.length, 12);
  var best = { score: -1, headerRows: 1, start: 0, map: {}, kinds: {} };
  var r;
  for (r = 0; r < maxScan; r += 1) {
    var row0 = (rows[r] || []).map(asText_);
    var folded = row0.map(fold_);
    var hasDni = folded.some(function (x) { return x === "dni" || x === "documento"; });
    var hasName = folded.some(function (x) { return x.indexOf("apellido") >= 0 || x.indexOf("nombre") >= 0 || x === "trabajador"; });
    if (!hasDni && !hasName) continue;
    var row1 = rows[r + 1] ? rows[r + 1].map(asText_) : [];
    var row2 = rows[r + 2] ? rows[r + 2].map(asText_) : [];
    var widthPad = Math.max(row0.length, row1.length, row2.length, 1);
    function padRow(row) {
      var copy = row.slice();
      while (copy.length < widthPad) copy.push("");
      return copy;
    }
    row0 = padRow(row0);
    row1 = padRow(row1);
    row2 = padRow(row2);
    var filled0 = fillRight_(row0);
    var filled1 = fillRight_(row1);
    function isLeaf_(x) {
      var f = fold_(x);
      return f === "cantidad" || f === "importe" || f === "cant" || f === "hrs" || f === "horas";
    }
    var headerRows = 1;
    if (row2.some(isLeaf_)) headerRows = 3;
    else if (row1.some(isLeaf_)) headerRows = 2;
    var map = {};
    var kinds = {};
    var width = Math.max(filled0.length, filled1.length, row2.length, 1);
    var c;
    for (c = 0; c < width; c += 1) {
      var a = fold_(filled0[c]);
      var b = fold_(filled1[c]);
      var d = fold_(row2[c]);
      var ident = identityKey_(fold_(row0[c])) || identityKey_(fold_(row1[c])) || identityKey_(fold_(row2[c])) || identityKey_(a) || identityKey_(b);
      if (ident) { map[ident] = c; continue; }
      var group = headerRows === 3 ? (b || a) : (a.indexOf("ingreso") >= 0 ? b : a);
      var leaf = headerRows === 3 ? d : (headerRows === 2 ? b : "");
      var kind = incomeKind_(group) || incomeKind_(a) || incomeKind_(b);
      var qi = qtyOrImp_(leaf) || qtyOrImp_(b) || qtyOrImp_(a);
      if (kind === "impHeOnly") { map.impHe = c; kinds.he = true; continue; }
      if (!kind) continue;
      kinds[kind] = true;
      if (qi === "imp") map["imp" + cap_(kind)] = c;
      else map["hrs" + cap_(kind)] = c;
    }
    if (map.semana == null) {
      var z = findSemanaCol_(row0, row1, row2, width);
      if (z != null) map.semana = z;
    }
    var score = Object.keys(map).length + (map.dni != null ? 5 : 0) + (map.nombres != null ? 3 : 0);
    if (kinds.he || kinds.he25 || kinds.he100) score += 8;
    if (score > best.score) best = { score: score, headerRows: headerRows, start: r, map: map, kinds: kinds };
  }
  return best;
}

function parseAoA_(rows, sheetName, extraFecha) {
  rows = rows || [];
  var period = parseSheetPeriod_(sheetName || "");
  if (!period.fecha && extraFecha) {
    period.fecha = extraFecha;
    period.anio = Number(String(extraFecha).slice(0, 4)) || 0;
    period.mes = Number(String(extraFecha).slice(5, 7)) || 0;
    period.semana = isoWeek_(extraFecha);
  }
  var found = buildColumnMap_(rows);
  var map = found.map || {};
  var start = (found.start || 0) + (found.headerRows || 1);
  var hasSplitCols = map.hrs25 != null || map.imp25 != null || map.hrs35 != null || map.imp35 != null;
  var records = [];
  var skipped = 0;
  var i;
  for (i = start; i < rows.length; i += 1) {
    var row = rows[i] || [];
    var empty = true;
    var k;
    for (k = 0; k < row.length; k += 1) {
      if (row[k] !== "" && row[k] != null) { empty = false; break; }
    }
    if (empty) continue;
    var nombres = asText_(cell_(row, map.nombres));
    var dni = digits_(cell_(row, map.dni));
    var nomFold = fold_(nombres);
    if (nomFold === "total" || nomFold.indexOf("total general") === 0 || nomFold.indexOf("totales") === 0 || fold_(dni) === "total") {
      skipped += 1;
      continue;
    }
    if (!dni && !nombres) { skipped += 1; continue; }
    var rec = {
      dni: dni,
      nombres: nombres.toUpperCase(),
      cargo: asText_(cell_(row, map.cargo)).toUpperCase(),
      area: asText_(cell_(row, map.area)).toUpperCase(),
      etapa: asText_(cell_(row, map.etapa)).toUpperCase(),
      jornal: money_(asNumber_(cell_(row, map.jornal))),
      fechaIngreso: parseDay_(cell_(row, map.fechaIngreso)),
      fechaCese: parseDay_(cell_(row, map.fechaCese)),
      fecha: parseDay_(cell_(row, map.fecha)),
      anio: asNumber_(cell_(row, map.anio)) || 0,
      mes: 0,
      mesNombre: "",
      semana: weekNum_(cell_(row, map.semana)),
      hrs25: hours_(asNumber_(cell_(row, map.hrs25))),
      imp25: money_(asNumber_(cell_(row, map.imp25))),
      hrs35: hours_(asNumber_(cell_(row, map.hrs35))),
      imp35: money_(asNumber_(cell_(row, map.imp35))),
      hrs100: hours_(asNumber_(cell_(row, map.hrs100))),
      imp100: money_(asNumber_(cell_(row, map.imp100))),
      hrsHe: hours_(asNumber_(cell_(row, map.hrsHe))),
      impHe: money_(asNumber_(cell_(row, map.impHe))),
      hrs: 0,
      imp: 0,
      split: false,
      hoja: sheetName || "",
      fila: i + 1,
    };
    if (map.mes != null) {
      var mv = cell_(row, map.mes);
      var mi = monthIndex_(mv);
      rec.mes = mi >= 0 ? mi + 1 : asNumber_(mv);
    }
    rec.split = !!(hasSplitCols && (rec.hrs25 || rec.hrs35 || rec.imp25 || rec.imp35));
    if (rec.split) {
      rec.hrs = hours_(rec.hrs25 + rec.hrs35 + rec.hrs100);
      rec.imp = money_(rec.imp25 + rec.imp35 + rec.imp100);
  } else {
      rec.hrs = hours_(rec.hrsHe + rec.hrs100 + rec.hrs25 + rec.hrs35);
      rec.imp = money_(rec.impHe + rec.imp100 + rec.imp25 + rec.imp35);
    }
    if (!rec.fecha && period.fecha) rec.fecha = period.fecha;
    if (rec.fecha) {
      rec.anio = rec.anio || Number(String(rec.fecha).slice(0, 4));
      rec.mes = rec.mes || Number(String(rec.fecha).slice(5, 7));
      rec.semana = rec.semana || isoWeek_(rec.fecha);
    }
    if (!rec.anio) rec.anio = period.anio || 0;
    if (!rec.mes) rec.mes = period.mes || 0;
    if (!rec.semana) rec.semana = period.semana || 0;
    rec.mesNombre = rec.mes ? mesNombre_(rec.mes) : "";
    rec.fechaLarga = rec.fecha ? fechaLarga_(rec.fecha) : "";
    if (rec.hrs <= 0.0001 && rec.imp <= 0.0001) { skipped += 1; continue; }
    records.push(rec);
  }
  return {
    tipo: found.score > 0 ? "planilla" : "desconocido",
    records: records,
    columnas: Object.keys(map),
    omitidas: skipped,
  };
}

function cell_(row, idx) {
  if (idx == null || idx < 0) return "";
  return row[idx];
}
