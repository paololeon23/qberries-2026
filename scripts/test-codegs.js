/* Prueba local de gas/Code.gs con mocks de Apps Script. */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var fails = 0;
var oks = 0;
function assert(cond, msg) {
  if (cond) { oks += 1; console.log("ok  ", msg); }
  else { fails += 1; console.error("FAIL", msg); }
}

var cache = {};
var props = {};
var sheets = [];
function makeSheet(name, values) {
  values = values ? values.map(function (r) { return r.slice(); }) : [];
  function width() {
    var w = 0;
    values.forEach(function (r) { if (r.length > w) w = r.length; });
    return w;
  }
  return {
    getName: function () { return name; },
    getSheetId: function () {
      var i;
      var n = 1;
      for (i = 0; i < name.length; i += 1) n += name.charCodeAt(i);
      return n;
    },
    getLastRow: function () { return values.length; },
    getLastColumn: function () { return width(); },
    getRange: function (r1, c1, nRows, nCols) {
      return {
        getValues: function () {
          if (name === "ROTA") throw new Error("no se puede leer");
          var out = [];
          var i, j, row;
          for (i = r1 - 1; i < r1 - 1 + nRows; i += 1) {
            row = [];
            for (j = c1 - 1; j < c1 - 1 + nCols; j += 1) {
              row.push(values[i] && values[i][j] != null ? values[i][j] : "");
            }
            out.push(row);
          }
          return out;
        },
        setValues: function (rows) {
          var i, j;
          for (i = 0; i < rows.length; i += 1) {
            values[r1 - 1 + i] = values[r1 - 1 + i] || [];
            for (j = 0; j < rows[i].length; j += 1) values[r1 - 1 + i][c1 - 1 + j] = rows[i][j];
          }
          return this;
        },
        setFontWeight: function () { return this; },
        setBackground: function () { return this; },
        setFontColor: function () { return this; },
        setHorizontalAlignment: function () { return this; },
        setVerticalAlignment: function () { return this; },
        setWrap: function () { return this; },
        merge: function () { return this; },
      };
    },
    setFrozenRows: function () {},
    getMaxRows: function () { return Math.max(values.length, 200); },
    setName: function (n) { name = n; },
    setTabColor: function () {},
    setColumnWidth: function () {},
    setRowHeight: function () {},
    setRowHeights: function () {},
    clear: function () { values = []; },
  };
}
function ss() {
  return {
    getId: function () { return "ss-test"; },
    getUrl: function () { return "https://docs.google.com/spreadsheets/d/ss-test"; },
    getActiveSheet: function () { return sheets[sheets.length - 1] || null; },
    getSheets: function () { return sheets; },
    getSheetByName: function (n) {
      var i;
      for (i = 0; i < sheets.length; i += 1) if (sheets[i].getName() === n) return sheets[i];
      return null;
    },
    insertSheet: function (n) {
      var sh = makeSheet(n, []);
      sheets.push(sh);
      return sh;
    },
    deleteSheet: function (sh) {
      sheets = sheets.filter(function (s) { return s !== sh; });
    },
  };
}
function pad(n) { n = Number(n) || 0; return n < 10 ? "0" + n : String(n); }
function fmt(d, pattern) {
  var date = d instanceof Date ? d : new Date(d);
  var y = date.getFullYear();
  var m = pad(date.getMonth() + 1);
  var day = pad(date.getDate());
  var h = pad(date.getHours());
  var mi = pad(date.getMinutes());
  var s = pad(date.getSeconds());
  if (pattern === "yyyy-MM-dd") return y + "-" + m + "-" + day;
  if (pattern === "dd-MM-yyyy") return day + "-" + m + "-" + y;
  return day + "-" + m + "-" + y + " " + h + ":" + mi + ":" + s;
}

var ctx = {
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  RegExp: RegExp,
  Error: Error,
  parseFloat: parseFloat,
  isFinite: isFinite,
  isNaN: isNaN,
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  CacheService: {
    getScriptCache: function () {
      return {
        get: function (k) { return cache[k] || null; },
        put: function (k, v) { cache[k] = v; },
        remove: function (k) { delete cache[k]; },
      };
    },
  },
  PropertiesService: {
    getScriptProperties: function () {
      return {
        getProperty: function (k) { return props[k] || null; },
        setProperty: function (k, v) { props[k] = v; return this; },
      };
    },
  },
  ContentService: {
    MimeType: { JSON: "JSON" },
    createTextOutput: function (s) {
      return { _raw: s, data: JSON.parse(s || "{}"), setMimeType: function () { return this; } };
    },
  },
  Utilities: { formatDate: function (d, tz, pattern) { return fmt(d, pattern); } },
  SpreadsheetApp: {
    openById: function () { throw new Error("no"); },
    getActive: function () { return ss(); },
    create: function () { return ss(); },
  },
  ScriptApp: {
    getProjectTriggers: function () { return []; },
    newTrigger: function () {
      return {
        forSpreadsheet: function () {
          return { onChange: function () { return { create: function () {} }; } };
        },
      };
    },
  },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "gas", "Code.gs"), "utf8"), ctx);

function data(out) { return out && out.data ? out.data : out; }

var planilla = [
  ["Apellidos y Nombres", "DNI", "Fecha Ingreso", "Fecha Cese", "Cargo", "ÁREA", "ETAPA", "JORNAL", "Ingresos"],
  ["", "", "", "", "", "", "", "", "HORAS EXTRAS", "", "Horas 100%", "", "B.Asistencia"],
  ["", "", "", "", "", "", "", "", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe"],
  ["PEREZ RAMOS LUIS", "12345678", "01/01/2025", "", "OBRERO", "SANIDAD", "", 52.47, 2, 13.12, 1, 13.12, 0, 0],
  ["Total", "", "", "", "", "", "", "", 2, 13.12, 1, 13.12, 0, 0],
  ["SIN HORAS", "11111111", "", "", "OBRERO", "RIEGO", "", 50, 0, 0, 0, 0, 0, 0],
  ["QUISPE ANA", "87654321", "02/02/2025", "", "AUXILIAR", "RIEGO", "", 48, 4, 26.24, 0, 0, 0, 0],
];
var detalle = [
  ["DNI", "Apellidos y Nombres", "ÁREA", "CARGO", "MES", "SEMANA", "F-TRABAJO", "HRS. 25%", "IMP. 25%", "Horas 100%", "IMP. 100%"],
  ["62257759", "AGUILAR DELFIN JERSON JAMPIER", "SANIDAD", "AUXILIAR", "Marzo", 11, "09/03/2026", 0, 2.45, 0, 0],
];

console.log("== Parser Code.gs ==");
var parsed = ctx.parseAoA_(planilla, "PlanillaGeneralDetallado");
assert(parsed.records.length === 2, "solo filas con HE, sin Total ni ceros");
assert(parsed.records[0].dni === "12345678", "DNI exacto");
assert(parsed.records[0].nombres === "PEREZ RAMOS LUIS", "nombres");
assert(parsed.records[0].area === "SANIDAD", "área SANIDAD");
assert(parsed.records[0].hrsHe === 2, "HORAS EXTRAS cantidad 2");
assert(parsed.records[0].impHe === 13.12, "HORAS EXTRAS importe 13.12");
assert(parsed.records[0].hrs100 === 1, "Horas 100% cantidad");
assert(parsed.records[0].imp100 === 13.12, "Horas 100% importe");
assert(parsed.records[0].hrs === 3, "total horas = extras + 100%");
assert(parsed.records[0].imp === 26.24, "total importe = extras + 100%");
assert(parsed.records[0].hrs25 === 0 && parsed.records[0].hrs35 === 0, "no inventa 25%/35%");
assert(parsed.records[1].dni === "87654321" && parsed.records[1].area === "RIEGO", "segunda fila RIEGO");

var empty = ctx.parseAoA_(planilla.slice(0, 3), "PlanillaGeneralDetallado");
assert(empty.records.length === 0, "solo encabezados no rompe");

var det = ctx.parseAoA_(detalle, "DETALLE_HE");
assert(det.records.length === 1, "detalle con importe y 0 horas entra");
assert(det.records[0].semana === 11, "semana 11");
assert(det.records[0].mes === 3, "mes Marzo = 3");
assert(det.records[0].fecha === "2026-03-09", "F-TRABAJO 2026-03-09");
assert(det.records[0].imp25 === 2.45, "importe 25%");
assert(det.records[0].hrs25 === 0, "no inventa horas 25%");

var per = ctx.parseSheetPeriod_("02-11-2026");
assert(per.fecha === "2026-11-02" && per.anio === 2026 && per.mes === 11, "nombre de hoja = fecha");
var dated = ctx.parseAoA_(planilla, "02-11-2026");
assert(dated.records[0].fecha === "2026-11-02", "filas sin F-TRABAJO heredan fecha de la hoja");
var hojaSinNombre = ctx.parseAoA_(planilla, "Hoja 3", "2026-11-01");
assert(hojaSinNombre.records[0].fecha === "2026-11-01", "Hoja 3 toma la fecha del día en que se creó");
assert(hojaSinNombre.records[0].semana === ctx.isoWeek_("2026-11-01"), "Hoja 3 trae semana ISO para el gráfico");

console.log("== doGet / login / pack ==");
var ping = data(ctx.doGet({ parameter: { action: "ping" } }));
assert(ping.ok === true && ping.app === "QBerries Horas Extras" && ping.tz === "America/Lima", "doGet ping");
var ping2 = data(ctx.doGet({}));
assert(ping2.ok === true && ping2.app === "QBerries Horas Extras", "doGet sin action = ping");

var loginOk = ctx.login_({ usuario: "Administrador", clave: "eduardo2026" });
assert(loginOk.ok === true && loginOk.data.id === "USR-ADMIN", "login correcto");
var loginBad = ctx.login_({ usuario: "Administrador", clave: "no" });
assert(loginBad.ok === false && loginBad.error === "clave_invalida", "login clave inválida");

sheets = [
  makeSheet("PlanillaGeneralDetallado", planilla),
  makeSheet("Config", [["k", "v"]]),
  makeSheet("Instrucciones", [["a"]]),
  makeSheet("Copia marzo", planilla),
  makeSheet("Hoja 1", []),
];
cache = {};
var pack = ctx.loadPack_();
assert(pack.ok === true, "loadPack ok");
assert(pack.total === 2, "dedup de hojas iguales = 2 registros");
assert(pack.sheets.every(function (s) { return s.name !== "Config" && s.name !== "Instrucciones"; }), "omite Config e Instrucciones");
assert(pack.sheets.some(function (s) { return s.name === "PlanillaGeneralDetallado"; }), "lee PlanillaGeneralDetallado si tiene data");
assert(pack.sheets.every(function (s) { return s.name !== "DETALLE_HE"; }), "no crea DETALLE_HE");
assert(pack.sheets.every(function (s) { return !/^\d{2}-\d{2}-\d{4}$/.test(s.name); }), "no inventa hoja con fecha");
assert(typeof pack.generatedAt === "string" && pack.generatedAt.length > 8, "generatedAt");

var meta = ctx.meta_();
assert(meta.ok === true && meta.total === 2 && !meta.records, "meta sin records");

var unknown = data(ctx.handle_("borrar", {}));
assert(unknown.error === "accion_desconocida", "acción desconocida");

var heGet = data(ctx.doGet({ parameter: { action: "he" } }));
assert(heGet.ok === true && heGet.total === 2, "doGet he usa pack");

var hoja2 = planilla.map(function (r) { return r.slice(); });
hoja2[3] = ["TORRES LUIS", "22222222", "01/01/2025", "", "OBRERO", "SANIDAD", "", 52.47, 1, 6.56, 0, 0, 0, 0];
hoja2[6] = ["FLORES EVA", "33333333", "02/02/2025", "", "AUXILIAR", "RIEGO", "", 48, 3, 19.68, 0, 0, 0, 0];
var hoja3 = planilla.map(function (r) { return r.slice(); });
hoja3[3] = ["MAMANI JOSE", "44444444", "01/01/2025", "", "OBRERO", "COSECHA", "", 52.47, 5, 32.8, 0, 0, 0, 0];
hoja3[6] = ["Total", "", "", "", "", "", "", "", 5, 32.8, 0, 0, 0, 0];
var fechaHoja = planilla.map(function (r) { return r.slice(); });
fechaHoja[3] = ["SALAS PEPE", "55555555", "01/01/2025", "", "OBRERO", "PACKING", "", 52.47, 2, 13.12, 0, 0, 0, 0];
fechaHoja[6] = ["Total", "", "", "", "", "", "", "", 2, 13.12, 0, 0, 0, 0];
sheets = [
  makeSheet("PlanillaGeneralDetallado", planilla.slice(0, 3)),
  makeSheet("Hoja 2", hoja2),
  makeSheet("Hoja 3", hoja3),
  makeSheet("01-11-2026", fechaHoja),
];
cache = {};
var pack23 = ctx.loadPack_();
assert(pack23.sheets.some(function (s) { return s.name === "Hoja 2"; }), "lee Hoja 2");
assert(pack23.sheets.some(function (s) { return s.name === "Hoja 3"; }), "lee Hoja 3");
assert(pack23.sheets.some(function (s) { return s.name === "01-11-2026"; }), "lee hoja con fecha");
assert(pack23.total === 4, "junta Hoja 2 + Hoja 3 + fecha (sin Total ni ceros)");
assert(pack23.records.some(function (r) { return r.dni === "22222222"; }), "registro de Hoja 2");
assert(pack23.records.some(function (r) { return r.dni === "44444444"; }), "registro de Hoja 3");
assert(pack23.records.every(function (r) { return Number(r.semana) > 0; }), "GET trae semana en todas las filas");
assert(pack23.records.some(function (r) { return r.dni === "55555555" && r.fecha === "2026-11-01"; }), "registro de la hoja con fecha");

cache["QBE_HE_PACK"] = JSON.stringify({ ok: true, total: 99, records: [], sheets: [] });
ctx.onSheetChange_({ changeType: "INSERT_GRID" });
assert(!cache["QBE_HE_PACK"], "al pulsar + se limpia el caché para leer la hoja nueva");

var dniNum = ctx.parseAoA_([
  ["Apellidos y Nombres", "DNI", "Cargo", "ÁREA", "Ingresos", ""],
  ["", "", "", "", "HORAS EXTRAS", ""],
  ["", "", "", "", "Cantidad", "Importe"],
  ["CARLOS ENRIQUE", 70000022, "COSECHADOR", "COSECHA", 2, "13,12"],
], "Hoja 4");
assert(dniNum.records.length === 1 && dniNum.records[0].dni === "70000022", "DNI numérico exacto");
assert(dniNum.records[0].impHe === 13.12, "importe 13,12 exacto");
assert(dniNum.records[0].area === "COSECHA", "área COSECHA");

var withErr = planilla.map(function (r) { return r.slice(); });
withErr[3] = ["X", "99999999", "", "", "OBRERO", "RIEGO", "", 50, { message: "#N/A" }, "#REF!", 1, 13.12];
var errParsed = ctx.parseAoA_(withErr, "Hoja 5");
assert(errParsed.records.some(function (r) { return r.dni === "99999999" && r.hrs100 === 1 && r.imp100 === 13.12; }), "celda #N/A no tumba la fila");

sheets = [
  makeSheet("Hoja 3", hoja3),
  makeSheet("ROTA", planilla),
  makeSheet("Hoja 4", []),
];
cache = {};
var packSafe = ctx.loadPack_();
assert(packSafe.ok === true, "pack no falla si una hoja está rota");
assert(packSafe.records.some(function (r) { return r.dni === "44444444"; }), "sigue leyendo Hoja 3");
assert(packSafe.sheets.some(function (s) { return s.name === "ROTA" && s.tipo === "error"; }), "marca la hoja rota sin cortar");
assert(packSafe.sheets.some(function (s) { return s.name === "Hoja 4" && s.tipo === "vacia"; }), "Hoja 4 vacía no rompe");

var heSafe = data(ctx.doGet({ parameter: { action: "he" } }));
assert(heSafe.ok === true && heSafe.records.some(function (r) { return r.dni === "44444444"; }), "doGet he sigue ok con hoja rota");

console.log("\n" + oks + " ok, " + fails + " fail");
process.exit(fails ? 1 : 0);
