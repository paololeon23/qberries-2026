/**
 * Fuente única de datos y agregaciones.
 * Todos los KPI, gráficos y la tabla salen de filter + aggregate sobre el mismo arreglo.
 */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var P = function () { return QBE.parser; };

  var AREA_ORDER = ["ALMACÉN", "GESTIÓN HUMANA", "MANTENIMIENTO", "PRODUCCIÓN I", "PRODUCCIÓN II", "RIEGO", "SANIDAD"];

  function money(n) { return P().money(n); }
  function hours(n) { return P().hours(n); }

  function areaKey(s) {
    var f = P().fold(s);
    if (f.indexOf("almacen") >= 0) return "ALMACÉN";
    if (f.indexOf("gestion humana") >= 0 || f === "rrhh" || f.indexOf("recursos humanos") >= 0) return "GESTIÓN HUMANA";
    if (f.indexOf("manten") >= 0) return "MANTENIMIENTO";
    if (f.indexOf("produccion i") >= 0 && f.indexOf("ii") < 0 && f.indexOf("2") < 0) return "PRODUCCIÓN I";
    if (f.indexOf("produccion ii") >= 0 || f.indexOf("produccion 2") >= 0) return "PRODUCCIÓN II";
    if (f.indexOf("produccion") >= 0) {
      if (/\bii\b/.test(f) || f.indexOf("2") >= 0) return "PRODUCCIÓN II";
      return "PRODUCCIÓN I";
    }
    if (f.indexOf("riego") >= 0) return "RIEGO";
    if (f.indexOf("sanidad") >= 0 || f.indexOf("fitosan") >= 0) return "SANIDAD";
    return String(s || "").toUpperCase() || "SIN ÁREA";
  }

  function compareArea(a, b) {
    var ia = AREA_ORDER.indexOf(a);
    var ib = AREA_ORDER.indexOf(b);
    if (ia < 0 && ib < 0) return a.localeCompare(b, "es");
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  }

  function uniqueSorted(list, cmp) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (v) {
      if (v == null || v === "" || v === 0) return;
      var k = String(v);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(v);
    });
    out.sort(cmp);
    return out;
  }

  function optionsFrom(records) {
    var anios = [];
    var meses = [];
    var semanas = [];
    var areas = [];
    (records || []).forEach(function (r) {
      if (r.anio) anios.push(r.anio);
      if (r.mes) meses.push(r.mes);
      if (r.semana) semanas.push(r.semana);
      if (r.area) areas.push(areaKey(r.area));
    });
    return {
      anios: uniqueSorted(anios, function (a, b) { return b - a; }),
      meses: uniqueSorted(meses, function (a, b) { return a - b; }),
      semanas: uniqueSorted(semanas, function (a, b) { return a - b; }),
      areas: uniqueSorted(areas, compareArea),
    };
  }

  function matchesFilter(rec, f) {
    if (f.anio && f.anio.length && f.anio.indexOf(Number(rec.anio)) < 0) return false;
    if (f.mes && f.mes.length && f.mes.indexOf(Number(rec.mes)) < 0) return false;
    if (f.semana && f.semana.length && f.semana.indexOf(Number(rec.semana)) < 0) return false;
    if (f.area && f.area.length && f.area.indexOf(areaKey(rec.area)) < 0) return false;
    if (f.q) {
      var blob = (rec.dni + " " + rec.nombres).toLowerCase();
      if (blob.indexOf(f.q) < 0) return false;
    }
    return true;
  }

  function filterRecords(records, f) {
    f = f || {};
    var q = String(f.q || "").toLowerCase().trim();
    var spec = {
      anio: (f.anio || []).map(Number).filter(Boolean),
      mes: (f.mes || []).map(Number).filter(Boolean),
      semana: (f.semana || []).map(Number).filter(Boolean),
      area: (f.area || []).map(areaKey).filter(Boolean),
      q: q,
    };
    if (!spec.anio.length && !spec.mes.length && !spec.semana.length && !spec.area.length && !spec.q) {
      return records || [];
    }
    var out = [];
    var list = records || [];
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (matchesFilter(list[i], spec)) out.push(list[i]);
    }
    return out;
  }

  function blankArea() {
    return { hrs25: 0, hrs35: 0, hrs100: 0, hrsHe: 0, imp25: 0, imp35: 0, imp100: 0, impHe: 0, hrs: 0, imp: 0, split: false };
  }
  function blankWeek() {
    return { hrs: 0, imp: 0, personas: {} };
  }

  function aggregate(records) {
    var byArea = {};
    var byWeek = {};
    var dniSet = {};
    var totalHrs = 0;
    var totalImp = 0;
    var splitAny = false;
    var i;
    var list = records || [];
    for (i = 0; i < list.length; i += 1) {
      var r = list[i];
      var area = areaKey(r.area);
      if (!byArea[area]) byArea[area] = blankArea();
      var a = byArea[area];
      a.hrs25 += r.hrs25 || 0;
      a.hrs35 += r.hrs35 || 0;
      a.hrs100 += r.hrs100 || 0;
      a.hrsHe += r.hrsHe || 0;
      a.imp25 += r.imp25 || 0;
      a.imp35 += r.imp35 || 0;
      a.imp100 += r.imp100 || 0;
      a.impHe += r.impHe || 0;
      a.hrs += r.hrs || 0;
      a.imp += r.imp || 0;
      if (r.split) {
        a.split = true;
        splitAny = true;
      }
      var w = Number(r.semana) || 0;
      if (w) {
        if (!byWeek[w]) byWeek[w] = blankWeek();
        byWeek[w].hrs += r.hrs || 0;
        byWeek[w].imp += r.imp || 0;
        if (r.dni) byWeek[w].personas[r.dni] = 1;
      }
      if (r.dni) dniSet[r.dni] = 1;
      totalHrs += r.hrs || 0;
      totalImp += r.imp || 0;
    }
    var areas = Object.keys(byArea).sort(compareArea);
    areas.forEach(function (k) {
      var x = byArea[k];
      x.hrs25 = hours(x.hrs25);
      x.hrs35 = hours(x.hrs35);
      x.hrs100 = hours(x.hrs100);
      x.hrsHe = hours(x.hrsHe);
      x.hrs = hours(x.hrs);
      x.imp25 = money(x.imp25);
      x.imp35 = money(x.imp35);
      x.imp100 = money(x.imp100);
      x.impHe = money(x.impHe);
      x.imp = money(x.imp);
    });
    var weeks = Object.keys(byWeek).map(Number).sort(function (a, b) { return a - b; });
    var weekRows = weeks.map(function (w) {
      var x = byWeek[w];
      return {
        semana: w,
        hrs: hours(x.hrs),
        imp: money(x.imp),
        colaboradores: Object.keys(x.personas).length,
      };
    });
    return {
      kpis: {
        totalHrs: hours(totalHrs),
        totalImp: money(totalImp),
        colaboradores: Object.keys(dniSet).length,
        registros: list.length,
      },
      areas: areas,
      byArea: byArea,
      weeks: weekRows,
      split: splitAny,
    };
  }

  function sortRecords(list, key, dir) {
    var d = dir < 0 ? -1 : 1;
    var copy = list.slice();
    copy.sort(function (a, b) {
      var va = a[key];
      var vb = b[key];
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * d;
      return String(va).localeCompare(String(vb), "es", { numeric: true }) * d;
    });
    return copy;
  }

  var SEED_PEOPLE = [
    { dni: "62257759", nombres: "AGUILAR DELFIN JERSON JAMPIER", area: "SANIDAD", cargo: "AUXILIAR DE PREMEZCLAS PRODUCTOS", jornal: 52.47 },
    { dni: "72211885", nombres: "AMAYA FERRER JONEL FREDDY", area: "SANIDAD", cargo: "SUPERVISOR DE FITOSANIDAD", jornal: 78.9 },
    { dni: "62938581", nombres: "BAUTISTA HUACCHA RONALDO JESUS", area: "RIEGO", cargo: "POCERO", jornal: 55.2 },
    { dni: "74292710", nombres: "CHUQUIRUNA ESTACIO OMAR BRANDOLI", area: "SANIDAD", cargo: "OPERADOR DE TRACTOR", jornal: 62.4 },
    { dni: "60676085", nombres: "CONTRERAS LULICHAC ANTONELLA MARICIELO", area: "PRODUCCIÓN I", cargo: "OBRERO", jornal: 52.47 },
  ];
  var APELLIDOS = ["QUISPE", "HUAMAN", "FLORES", "RAMOS", "TORRES", "CASTILLO", "MENDOZA", "SILVA", "DIAZ", "PÉREZ", "GARCÍA", "ROJAS", "VARGAS", "CHÁVEZ", "LOPEZ", "CRUZ", "REYES", "NAVARRO", "PACHECO", "SALAS"];
  var NOMBRES = ["LUIS", "MARIA", "JOSE", "ANA", "CARLOS", "ROSA", "PEDRO", "LUCIA", "JORGE", "ELENA", "MIGUEL", "PATRICIA", "ALBERTO", "CARMEN", "DIEGO", "KATHERINE", "ANDRES", "FIORELLA", "HECTOR", "VALERIA"];
  var CARGOS = {
    "ALMACÉN": "ALMACENERO",
    "GESTIÓN HUMANA": "ANALISTA DE RRHH",
    "MANTENIMIENTO": "MECÁNICO",
    "PRODUCCIÓN I": "OBRERO",
    "PRODUCCIÓN II": "OBRERO",
    "RIEGO": "OPERARIO DE RIEGO",
    "SANIDAD": "AUXILIAR DE SANIDAD",
  };

  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rate(jornal, pct) {
    var h = (Number(jornal) || 52.47) / 8;
    if (pct === 25) return money(h * 1.25);
    if (pct === 35) return money(h * 1.35);
    return money(h * 2);
  }

  function ymdFromWeek(year, week, weekday) {
    var simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    var dow = simple.getUTCDay();
    var ISOweekStart = simple;
    if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
    else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
    ISOweekStart.setUTCDate(ISOweekStart.getUTCDate() + (weekday || 0));
    return ISOweekStart.getUTCFullYear() + "-" + pad(ISOweekStart.getUTCMonth() + 1) + "-" + pad(ISOweekStart.getUTCDate());
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function buildDemo() {
    var rnd = seeded(202611);
    var people = SEED_PEOPLE.slice();
    var used = {};
    SEED_PEOPLE.forEach(function (p) { used[p.dni] = 1; });
    var quota = { "ALMACÉN": 6, "GESTIÓN HUMANA": 6, "MANTENIMIENTO": 8, "PRODUCCIÓN I": 22, "PRODUCCIÓN II": 22, "RIEGO": 20, "SANIDAD": 22 };
    SEED_PEOPLE.forEach(function (p) {
      if (quota[p.area] > 0) quota[p.area] -= 1;
    });
    AREA_ORDER.forEach(function (area) {
      var n = quota[area] || 0;
      var i;
      for (i = 0; i < n; i += 1) {
        var dni = String(60000000 + Math.floor(rnd() * 19999999));
        if (used[dni]) { i -= 1; continue; }
        used[dni] = 1;
        people.push({
          dni: dni,
          nombres: APELLIDOS[Math.floor(rnd() * APELLIDOS.length)] + " " + APELLIDOS[Math.floor(rnd() * APELLIDOS.length)] + " " + NOMBRES[Math.floor(rnd() * NOMBRES.length)] + " " + NOMBRES[Math.floor(rnd() * NOMBRES.length)],
          area: area,
          cargo: CARGOS[area] || "OBRERO",
          jornal: area === "GESTIÓN HUMANA" ? 95 : area.indexOf("PRODUCCIÓN") === 0 ? 52.47 : 58.6,
        });
      }
    });
    var plan = [
      { area: "ALMACÉN", h25: 0, h35: 0, h100: 8, weeks: [7] },
      { area: "GESTIÓN HUMANA", h25: 0, h35: 11, h100: 0, weeks: [8] },
      { area: "MANTENIMIENTO", h25: 0, h35: 17, h100: 0, weeks: [9] },
      { area: "PRODUCCIÓN I", h25: 103, h35: 0, h100: 6, weeks: [7, 8, 9, 10, 11] },
      { area: "PRODUCCIÓN II", h25: 103, h35: 0, h100: 5, weeks: [7, 8, 9, 10, 11] },
      { area: "RIEGO", h25: 23, h35: 0, h100: 830, weeks: [7, 8, 9, 10] },
      { area: "SANIDAD", h25: 316, h35: 0, h100: 0, weeks: [7, 8, 9, 10, 11] },
    ];
    var byAreaPeople = {};
    people.forEach(function (p) {
      var k = p.area;
      if (!byAreaPeople[k]) byAreaPeople[k] = [];
      byAreaPeople[k].push(p);
    });
    var records = [];
    function pushSlice(person, week, weekday, tipo, qty) {
      qty = hours(qty);
      if (qty <= 0) return;
      var fecha = ymdFromWeek(2026, week, weekday);
      var rec = {
        dni: person.dni,
        nombres: person.nombres,
        cargo: person.cargo,
        area: person.area,
        etapa: "",
        jornal: person.jornal,
        fechaIngreso: "",
        fechaCese: "",
        fecha: fecha,
        anio: 2026,
        mes: Number(fecha.slice(5, 7)),
        mesNombre: P().mesNombre(Number(fecha.slice(5, 7))),
        semana: week,
        hrs25: 0,
        imp25: 0,
        hrs35: 0,
        imp35: 0,
        hrs100: 0,
        imp100: 0,
        hrsHe: 0,
        impHe: 0,
        split: true,
        hoja: "DEMO",
        fila: records.length + 1,
        demo: true,
      };
      if (tipo === 25) {
        rec.hrs25 = qty;
        rec.imp25 = money(qty * rate(person.jornal, 25));
      } else if (tipo === 35) {
        rec.hrs35 = qty;
        rec.imp35 = money(qty * rate(person.jornal, 35));
      } else {
        rec.hrs100 = qty;
        rec.imp100 = money(qty * rate(person.jornal, 100));
      }
      rec.hrs = hours(rec.hrs25 + rec.hrs35 + rec.hrs100);
      rec.imp = money(rec.imp25 + rec.imp35 + rec.imp100);
      rec.fechaLarga = P().fechaLarga(fecha);
      records.push(rec);
    }
    plan.forEach(function (item) {
      var group = byAreaPeople[item.area];
      if (!group || !group.length) return;
      function spray(tipo, total) {
        var left = total;
        var n = 0;
        while (left > 0.009 && n < 4000) {
          n += 1;
          var person = group[Math.floor(rnd() * group.length)];
          var week = item.weeks[Math.floor(rnd() * item.weeks.length)];
          var day = Math.floor(rnd() * 6);
          var chunk = tipo === 100 ? Math.min(left, 2 + rnd() * 6) : Math.min(left, 0.5 + rnd() * 2);
          chunk = hours(Math.min(chunk, left));
          pushSlice(person, week, day, tipo, chunk);
          left = hours(left - chunk);
        }
      }
      spray(25, item.h25);
      spray(35, item.h35);
      spray(100, item.h100);
    });
    records.sort(function (a, b) {
      var na = a.nombres.localeCompare(b.nombres, "es");
      if (na) return na;
      return String(a.fecha).localeCompare(String(b.fecha));
    });
    return records;
  }

  QBE.data = {
    AREA_ORDER: AREA_ORDER,
    areaKey: areaKey,
    compareArea: compareArea,
    optionsFrom: optionsFrom,
    filterRecords: filterRecords,
    aggregate: aggregate,
    sortRecords: sortRecords,
    buildDemo: buildDemo,
  };
})(typeof window !== "undefined" ? window : globalThis);
