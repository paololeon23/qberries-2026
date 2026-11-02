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

  QBE.data = {
    AREA_ORDER: AREA_ORDER,
    areaKey: areaKey,
    compareArea: compareArea,
    optionsFrom: optionsFrom,
    filterRecords: filterRecords,
    aggregate: aggregate,
    sortRecords: sortRecords,
  };
})(typeof window !== "undefined" ? window : globalThis);
