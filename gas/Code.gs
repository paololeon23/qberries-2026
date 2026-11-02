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
 * Lee TODAS las hojas: Hoja 2, Hoja 3, 01-11-2026, copias… cada una nueva entra.
 * No inventa horas ni importes.
 * Plantilla: PlanillaGeneralDetallado (solo encabezados).
 * Cada día se crea una hoja con la fecha de Lima: 02-11-2026, 03-11-2026…
 * El GET junta todas. Filas repetidas (misma huella) se omiten.
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
var HEADER_BG = "#e8eaed";
var HEADER_FG = "#3c4043";

var MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];

function doGet(e) {
  var action = String((e && e.parameter && e.parameter.action) || "").toLowerCase();
  if (action === "ping" || !action) return json_({ ok: true, app: APP, tz: TZ });
  if (action === "meta") return json_(meta_());
  return json_(loadPack_());
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
  ensureSheets_(ss);
  CacheService.getScriptCache().remove(CACHE_KEY);
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", ss.getId());
  return ss.getUrl();
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
  var id = props.getProperty("SPREADSHEET_ID");
  var ss = null;
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (err) {
      ss = null;
    }
  }
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActive();
    } catch (err) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create("QBerries Horas Extras");
  }
  props.setProperty("SPREADSHEET_ID", ss.getId());
  ensureSheets_(ss);
  return ss;
}

function hoyYmd_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}
function hoyHoja_() {
  return Utilities.formatDate(new Date(), TZ, "dd-MM-yyyy");
}

function ensureSheets_(ss) {
  var def = ss.getSheetByName("Hoja 1") || ss.getSheetByName("Hoja1") || ss.getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && !ss.getSheetByName("PlanillaGeneralDetallado")) {
    def.setName("PlanillaGeneralDetallado");
  }
  ensurePlanilla_(ss);
  ensureHojaDia_(ss);
  prepareHojasNuevas_(ss);
  dropEmptyDefaults_(ss);
}

function dropEmptyDefaults_(ss) {
  var keep = hoyHoja_();
  ["Hoja 1", "Hoja1", "Sheet1", "Sheet 1", "DETALLE_HE"].forEach(function (name) {
    if (name === keep) return;
    var extra = ss.getSheetByName(name);
    if (!extra) return;
    var empty = name === "DETALLE_HE" ? extra.getLastRow() <= 1 : extra.getLastRow() === 0;
    if (empty && ss.getSheets().length > 1) ss.deleteSheet(extra);
  });
}

function paintHeader_(sh, cols, rows, tabColor) {
  if (!sh) return;
  rows = Number(rows) || 1;
  cols = Math.max(Number(cols) || 1, sh.getLastColumn() || 1, 1);
  sh.setFrozenRows(rows);
  sh.getRange(1, 1, rows, cols)
    .setFontWeight("bold")
    .setBackground(HEADER_BG)
    .setFontColor(HEADER_FG)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);
  sh.getRange(1, 1, sh.getMaxRows(), cols)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  if (tabColor) sh.setTabColor(tabColor);
}

function mergePair_(sh, row, startCol) {
  try {
    sh.getRange(row, startCol, 1, 2).merge();
  } catch (err) {}
}

function plantillaRows_() {
  return {
    row1: ["Apellidos y Nombres", "DNI", "Fecha Ingreso", "Fecha Cese", "Cargo", "ÁREA", "ETAPA", "JORNAL", "Ingresos"],
    row2: ["", "", "", "", "", "", "", "", "HORAS EXTRAS", "", "Horas 100%", "", "B.Asistencia", "", "B.Labores", "", "D. Medico", "", "BONO COSECHA", "", "REINTEGROS", "", "Movilidad", "", "TOTAL PLANILLA"],
    row3: ["", "", "", "", "", "", "", "", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe", ""],
  };
}

function fillPlantilla_(sh, name) {
  var t = plantillaRows_();
  var cols = 25;
  if (sh.getLastRow() >= 3) {
    paintHeader_(sh, cols, 3, "#c5c9ce");
    return sh;
  }
  sh.clear();
  if (name) sh.setName(name);
  sh.getRange(1, 1, 1, t.row1.length).setValues([t.row1]);
  sh.getRange(2, 1, 1, t.row2.length).setValues([t.row2]);
  sh.getRange(3, 1, 1, t.row3.length).setValues([t.row3]);
  try { sh.getRange(1, 9, 1, 16).merge(); } catch (err1) {}
  var c;
  for (c = 9; c <= 23; c += 2) mergePair_(sh, 2, c);
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 90);
  sh.setRowHeights(1, 3, 26);
  paintHeader_(sh, cols, 3, "#c5c9ce");
  return sh;
}

function ensurePlanilla_(ss) {
  var sh = ss.getSheetByName("PlanillaGeneralDetallado") || ss.insertSheet("PlanillaGeneralDetallado");
  fillPlantilla_(sh, "PlanillaGeneralDetallado");
}

function ensureHojaDia_(ss) {
  var name = hoyHoja_();
  var sh = ss.getSheetByName(name);
  if (sh) {
    fillPlantilla_(sh, name);
    return sh;
  }
  var hoja1 = ss.getSheetByName("Hoja 1") || ss.getSheetByName("Hoja1") || ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1");
  if (hoja1 && hoja1.getLastRow() === 0) {
    hoja1.setName(name);
    fillPlantilla_(hoja1, name);
    return hoja1;
  }
  sh = ss.insertSheet(name);
  fillPlantilla_(sh, name);
  return sh;
}

function prepareHojasNuevas_(ss) {
  var sheets = ss.getSheets();
  var i;
  for (i = 0; i < sheets.length; i += 1) {
    var sh = sheets[i];
    var n = sh.getName();
    if (n === "PlanillaGeneralDetallado") continue;
    if (/^config/i.test(n) || /^instrucc/i.test(n)) continue;
    if (!(/^hoja\s*\d+$/i.test(n) || /^sheet\s*\d+$/i.test(n))) continue;
    if (sh.getLastRow() === 0) fillPlantilla_(sh, n);
  }
}

function loadPack_() {
  var ss = getSpreadsheet();
  try {
    var hit = CacheService.getScriptCache().get(CACHE_KEY);
    if (hit) return JSON.parse(hit);
  } catch (err) {}
  var sheets = ss.getSheets();
  var all = [];
  var meta = [];
  var seen = {};
  var i;
  for (i = 0; i < sheets.length; i += 1) {
    var sh = sheets[i];
    var name = sh.getName();
    if (/^config/i.test(name) || /^instrucc/i.test(name)) continue;
    if (name === "PlanillaGeneralDetallado" && sh.getLastRow() <= 3) {
      meta.push({ name: name, tipo: "plantilla", filas: 0, columnas: [] });
      continue;
    }
    var last = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (last < 2 || lastCol < 2) {
      meta.push({ name: name, tipo: "vacia", filas: 0, columnas: [] });
      continue;
    }
    var values = sh.getRange(1, 1, last, lastCol).getValues();
    var parsed = parseAoA_(values, name);
    meta.push({
      name: name,
      tipo: parsed.tipo,
      filas: parsed.records.length,
      columnas: parsed.columnas,
      omitidas: parsed.omitidas,
    });
    parsed.records.forEach(function (rec) {
      var fp = rec.dni + "|" + rec.fecha + "|" + rec.area + "|" + rec.cargo + "|" + rec.semana + "|" + rec.hrsHe + "|" + rec.impHe + "|" + rec.hrs25 + "|" + rec.hrs35 + "|" + rec.hrs100 + "|" + rec.imp;
      if (seen[fp]) return;
      seen[fp] = 1;
      all.push(rec);
    });
  }
  var pack = {
    ok: true,
    app: APP,
    records: all,
    sheets: meta,
    generatedAt: Utilities.formatDate(new Date(), TZ, "dd-MM-yyyy HH:mm:ss"),
    total: all.length,
  };
  try {
    var raw = JSON.stringify(pack);
    if (raw.length < 90000) CacheService.getScriptCache().put(CACHE_KEY, raw, CACHE_TTL);
  } catch (err2) {}
  return pack;
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
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (Object.prototype.toString.call(v) === "[object Date]") return 0;
  var s = String(v).trim().replace(/s\/\.?/gi, "").replace(/\s/g, "");
  if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.indexOf(",") >= 0) s = s.replace(",", ".");
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
  return String(s || "").replace(/\D/g, "").slice(0, 12);
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
function identityKey_(a) {
  if (a === "apellidos y nombres" || a === "trabajador" || a === "nombres y apellidos" || a === "nombre" || a === "apellidos") return "nombres";
  if (a === "dni" || a === "documento" || a === "nro documento" || a === "codigo trabajador") return "dni";
  if (a === "fecha ingreso" || a === "f ingreso" || a === "f. ingreso") return "fechaIngreso";
  if (a === "fecha cese" || a === "f cese") return "fechaCese";
  if (a === "cargo" || a === "tipo de planilla") return "cargo";
  if (a === "area" || a === "ceco") return "area";
  if (a === "etapa") return "etapa";
  if (a === "jornal") return "jornal";
  if (a === "f trabajo" || a === "fecha trabajo" || a === "fecha" || a === "f-trabajo") return "fecha";
  if (a === "semana") return "semana";
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
    var three = row1.concat(row2).some(function (x) {
      var f = fold_(x);
      return f === "cantidad" || f === "importe";
    });
    var headerRows = three && row2.length ? 3 : three ? 2 : 1;
    var map = {};
    var kinds = {};
    var width = Math.max(filled0.length, filled1.length, row2.length, 1);
    var c;
    for (c = 0; c < width; c += 1) {
      var a = fold_(filled0[c]);
      var b = fold_(filled1[c]);
      var d = fold_(row2[c]);
      var ident = identityKey_(a) || identityKey_(b);
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
    var score = Object.keys(map).length + (map.dni != null ? 5 : 0) + (map.nombres != null ? 3 : 0);
    if (kinds.he || kinds.he25 || kinds.he100) score += 8;
    if (score > best.score) best = { score: score, headerRows: headerRows, start: r, map: map, kinds: kinds };
  }
  return best;
}

function parseAoA_(rows, sheetName) {
  rows = rows || [];
  var period = parseSheetPeriod_(sheetName || "");
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
    if (fold_(nombres) === "total" || fold_(dni) === "total") { skipped += 1; continue; }
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
      semana: asNumber_(cell_(row, map.semana)) || 0,
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
