/* Pruebas de parser, filtros y consistencia KPI = tabla = gráficos. */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ctx = {
  console: console,
  Date: Date,
  Math: Math,
  Intl: Intl,
  JSON: JSON,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  parseFloat: parseFloat,
  isFinite: isFinite,
  isNaN: isNaN,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
};
vm.createContext(ctx);
["parser.js", "data.js"].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx);
});
var QBE = ctx.QBE;
var fails = 0;
function assert(cond, msg) {
  if (!cond) {
    fails += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok  ", msg);
  }
}

var headers = [
  ["Apellidos y Nombres", "DNI", "Fecha Ingreso", "Fecha Cese", "Cargo", "ÁREA", "ETAPA", "JORNAL", "Ingresos"],
  ["", "", "", "", "", "", "", "", "HORAS EXTRAS", "", "Horas 100%"],
  ["", "", "", "", "", "", "", "", "Cantidad", "Importe", "Cantidad", "Importe"],
  ["PEREZ RAMOS LUIS", "12345678", "01/01/2025", "", "OBRERO", "SANIDAD", "", 52.47, 2, 13.12, 1, 13.12],
  ["Total", "", "", "", "", "", "", "", 2, 13.12, 1, 13.12],
  ["SIN HORAS", "11111111", "", "", "OBRERO", "RIEGO", "", 50, 0, 0, 0, 0],
];
var parsed = QBE.parser.parseAoA(headers, "PlanillaGeneralDetallado");
assert(parsed.records.length === 1, "solo filas con HE, sin total ni ceros");
assert(parsed.records[0].dni === "12345678", "DNI exacto");
assert(parsed.records[0].nombres === "PEREZ RAMOS LUIS", "nombres exactos");
assert(parsed.records[0].area === "SANIDAD", "área exacta");
assert(parsed.records[0].hrsHe === 2, "HORAS EXTRAS cantidad");
assert(parsed.records[0].impHe === 13.12, "HORAS EXTRAS importe");
assert(parsed.records[0].hrs100 === 1, "Horas 100% cantidad");
assert(parsed.records[0].imp100 === 13.12, "Horas 100% importe");
assert(parsed.records[0].hrs === 3, "total horas = extras + 100%");
assert(parsed.records[0].imp === 26.24, "total importe = extras + 100%");

var empty = QBE.parser.parseAoA(headers.slice(0, 3), "PlanillaGeneralDetallado");
assert(empty.records.length === 0, "planilla vacía no rompe");
var agg0 = QBE.data.aggregate([]);
assert(agg0.kpis.totalHrs === 0 && agg0.kpis.totalImp === 0 && agg0.kpis.colaboradores === 0, "vacío en cero");

var detalle = [
  ["DNI", "Apellidos y Nombres", "ÁREA", "CARGO", "MES", "SEMANA", "F-TRABAJO", "HRS. 25%", "IMP. 25%", "Horas 100%", "IMP. 100%"],
  ["62257759", "AGUILAR DELFIN JERSON JAMPIER", "SANIDAD", "AUXILIAR", "Marzo", 11, "09/03/2026", 0, 2.45, 0, 0],
];
var d = QBE.parser.parseAoA(detalle, "DETALLE_HE");
assert(d.records.length === 1, "detalle con importe y 0 horas entra");
assert(d.records[0].semana === 11, "semana leída");
assert(d.records[0].mes === 3, "mes Marzo = 3");
assert(d.records[0].fecha === "2026-03-09", "F-TRABAJO parseada");
assert(d.records[0].imp25 === 2.45, "importe 25% sin inventar horas");

var rows = parsed.records.concat(d.records, [{
  dni: "87654321",
  nombres: "QUISPE ANA",
  area: "RIEGO",
  cargo: "AUXILIAR",
  anio: 2026,
  mes: 3,
  semana: 10,
  fecha: "2026-03-02",
  hrs25: 0,
  hrs35: 0,
  hrs100: 0,
  hrsHe: 4,
  imp25: 0,
  imp35: 0,
  imp100: 0,
  impHe: 26.24,
  hrs: 4,
  imp: 26.24,
  split: false,
}]);
var filt = QBE.data.filterRecords(rows, { area: ["SANIDAD"] });
var aAll = QBE.data.aggregate(rows);
var aSan = QBE.data.aggregate(filt);
assert(aSan.kpis.totalHrs <= aAll.kpis.totalHrs, "filtro reduce o iguala horas");
assert(filt.every(function (r) { return r.area === "SANIDAD"; }), "filtro solo SANIDAD");
var sumHrs = rows.reduce(function (s, r) { return s + r.hrs; }, 0);
var sumImp = rows.reduce(function (s, r) { return s + r.imp; }, 0);
assert(Math.abs(QBE.parser.hours(sumHrs) - aAll.kpis.totalHrs) < 0.02, "KPI horas = suma registros");
assert(Math.abs(QBE.parser.money(sumImp) - aAll.kpis.totalImp) < 0.05, "KPI costo = suma registros");
var dni = {};
rows.forEach(function (r) { dni[r.dni] = 1; });
assert(Object.keys(dni).length === aAll.kpis.colaboradores, "KPI colaboradores = DNI únicos");
var weeks = aAll.weeks.map(function (w) { return w.semana; });
var sorted = weeks.slice().sort(function (a, b) { return a - b; });
assert(weeks.join() === sorted.join(), "semanas ordenadas");

var many = [];
var i;
for (i = 0; i < 4000; i += 1) {
  many.push({
    dni: String(10000000 + (i % 800)),
    nombres: "T" + i,
    area: i % 2 ? "RIEGO" : "SANIDAD",
    cargo: "OBRERO",
    anio: 2026,
    mes: 3,
    semana: (i % 10) + 1,
    fecha: "2026-03-09",
    hrs25: 1,
    hrs35: 0,
    hrs100: 0,
    hrsHe: 0,
    imp25: 8.2,
    imp35: 0,
    imp100: 0,
    impHe: 0,
    hrs: 1,
    imp: 8.2,
    split: true,
  });
}
var t0 = Date.now();
var f2 = QBE.data.filterRecords(many, { area: ["RIEGO"], semana: [3] });
var a2 = QBE.data.aggregate(f2);
var ms = Date.now() - t0;
assert(ms < 250, "4000 registros filtrados+agregados en " + ms + " ms");
assert(a2.kpis.totalHrs === f2.length, "agregado coincide con filtrado");

var nullRow = QBE.parser.parseAoA(headers.concat([[null, null, null, null, null, null, null, null, null]]), "x");
assert(nullRow.ok !== false, "nulos no rompen");

if (fails) {
  console.error("\n" + fails + " fallas");
  process.exit(1);
}
console.log("\nOK — parser, filtros y KPI consistentes");
