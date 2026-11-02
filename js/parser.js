/**
 * Parser de planilla QBerries.
 * Mapea SOLO columnas reales del Excel "Reporte Planilla General Detallado".
 * No inventa horas, importes, fechas ni porcentajes.
 *
 * Encabezado real (3 filas):
 *   A Apellidos y Nombres | B DNI | C Fecha Ingreso | D Fecha Cese
 *   E Cargo | F ÁREA | G ETAPA | H JORNAL | I Ingresos
 *   I2 HORAS EXTRAS | K2 Horas 100% | M2 B.Asistencia | O2 B.Labores
 *   Q2 D. Medico | S2 BONO COSECHA | U2 REINTEGROS | W2 Movilidad | Y2 TOTAL PLANILLA
 *   Fila 3: Cantidad | Importe (por cada grupo de ingresos)
 *
 * Del dashboard de HE solo entran: HORAS EXTRAS y Horas 100%.
 * Si en una hoja aparecen columnas 25% / 35% / F-TRABAJO / SEMANA / MES, también se leen.
 */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});

  var MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
  var MESES_ALT = { septiembre: 8, setiembre: 8 };
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  function fold(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9%]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function pad(n) {
    n = Number(n) || 0;
    return n < 10 ? "0" + n : String(n);
  }
  function isBlank(v) {
    return v == null || String(v).trim() === "";
  }
  function asText(v) {
    if (v == null) return "";
    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
    }
    return String(v).replace(/\s+/g, " ").trim();
  }
  function asNumber(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    var s = String(v).trim();
    if (!s) return 0;
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
  function money(n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  }
  function hours(n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  }
  function digits(s, n) {
    var d = String(s || "").replace(/\D/g, "");
    return n ? d.slice(0, n) : d;
  }
  function excelSerialToYmd(n) {
    var x = Number(n);
    if (!isFinite(x) || x < 20000 || x > 80000) return "";
    var utc = Date.UTC(1899, 11, 30) + Math.round(x) * 86400000;
    var d = new Date(utc);
    if (isNaN(d.getTime())) return "";
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function parseDay(v) {
    if (v == null || v === "") return "";
    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
    }
    if (typeof v === "number") return excelSerialToYmd(v);
    var s = String(v).trim();
    if (!s) return "";
    var iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (iso) {
      var di = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if (!isNaN(di.getTime())) return di.getFullYear() + "-" + pad(di.getMonth() + 1) + "-" + pad(di.getDate());
    }
    var pe = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (pe) {
      var y = Number(pe[3]);
      if (y < 100) y += 2000;
      var dp = new Date(y, Number(pe[2]) - 1, Number(pe[1]));
      if (!isNaN(dp.getTime()) && Number(pe[1]) <= 31 && Number(pe[2]) <= 12) {
        return dp.getFullYear() + "-" + pad(dp.getMonth() + 1) + "-" + pad(dp.getDate());
      }
    }
    var longEs = s.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    if (longEs) {
      var mi = monthIndex(longEs[2]);
      if (mi >= 0) {
        var dl = new Date(Number(longEs[3]), mi, Number(longEs[1]));
        if (!isNaN(dl.getTime())) return dl.getFullYear() + "-" + pad(dl.getMonth() + 1) + "-" + pad(dl.getDate());
      }
    }
    return "";
  }
  function monthIndex(name) {
    var f = fold(name);
    if (MESES_ALT[f] != null) return MESES_ALT[f];
    for (var i = 0; i < MESES.length; i += 1) if (fold(MESES[i]) === f) return i;
    return -1;
  }
  function isoWeek(ymd) {
    if (!ymd) return 0;
    var p = ymd.split("-");
    var date = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  }
  function isoWeekYear(ymd) {
    if (!ymd) return 0;
    var p = ymd.split("-");
    var date = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    return date.getUTCFullYear();
  }
  function mesNombre(m) {
    return MESES[(Number(m) || 1) - 1] || "";
  }
  function fechaLarga(ymd) {
    if (!ymd) return "";
    var p = ymd.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return ymd;
    return DIAS[d.getDay()] + ", " + pad(d.getDate()) + " de " + mesNombre(d.getMonth() + 1).toLowerCase() + " de " + d.getFullYear();
  }
  function fillRight(row) {
    var out = row.slice();
    var last = "";
    for (var i = 0; i < out.length; i += 1) {
      var t = asText(out[i]);
      if (t) last = t;
      else if (last) out[i] = last;
    }
    return out;
  }
  function parseSheetPeriod(name) {
    var f = fold(name);
    var out = { anio: 0, mes: 0, semana: 0, fecha: "" };
    var w = f.match(/semana\s*(\d{1,2})/);
    if (w) out.semana = Number(w[1]);
    var y = f.match(/(20\d{2})/);
    if (y) out.anio = Number(y[1]);
    for (var i = 0; i < MESES.length; i += 1) {
      if (f.indexOf(fold(MESES[i])) >= 0) out.mes = i + 1;
    }
    if (MESES_ALT[f]) out.mes = MESES_ALT[f] + 1;
    var iso = f.match(/(20\d{2})[^\d](\d{1,2})[^\d](\d{1,2})/);
    if (iso) out.fecha = iso[1] + "-" + pad(iso[2]) + "-" + pad(iso[3]);
    return out;
  }

  var IDENTITY = {
    nombres: ["apellidos y nombres", "trabajador", "nombres y apellidos", "nombre", "apellidos"],
    dni: ["dni", "documento", "nro documento", "numero documento", "codigo trabajador"],
    fechaIngreso: ["fecha ingreso", "f ingreso", "f. ingreso"],
    fechaCese: ["fecha cese", "f cese", "f. cese"],
    cargo: ["cargo", "tipo de planilla"],
    area: ["area", "ceco"],
    etapa: ["etapa"],
    jornal: ["jornal"],
  };
  var DATE_KEYS = ["f trabajo", "fecha trabajo", "fecha", "f-trabajo", "f trabajo"];
  var WEEK_KEYS = ["semana"];
  var MONTH_KEYS = ["mes"];
  var YEAR_KEYS = ["ano", "anio", "year"];

  function matchList(key, list) {
    for (var i = 0; i < list.length; i += 1) if (key === list[i] || key.indexOf(list[i]) === 0) return true;
    return false;
  }
  function incomeKind(group) {
    var g = fold(group);
    if (!g) return "";
    if (g.indexOf("25") >= 0 && (g.indexOf("hora") >= 0 || g.indexOf("he") >= 0 || g.indexOf("hrs") >= 0 || g === "25" || g.indexOf("%") >= 0)) return "he25";
    if (g.indexOf("35") >= 0 && (g.indexOf("hora") >= 0 || g.indexOf("he") >= 0 || g.indexOf("hrs") >= 0 || g === "35" || g.indexOf("%") >= 0)) return "he35";
    if (g.indexOf("100") >= 0 && (g.indexOf("hora") >= 0 || g.indexOf("he") >= 0 || g.indexOf("hrs") >= 0 || g === "100" || g.indexOf("%") >= 0)) return "he100";
    if (g === "horas extras" || g === "hora extras" || g === "h extras" || g === "hrs extras" || g === "he" || g === "total h e" || g === "total he") return "he";
    if (g === "hrs extras s" || g === "hrs extras s/" || g === "horas extras s" || g.indexOf("hrs extras s") === 0) return "impHeOnly";
    return "";
  }
  function qtyOrImp(label) {
    var g = fold(label);
    if (!g) return "";
    if (g.indexOf("imp") === 0 || g.indexOf("importe") >= 0 || g === "costo" || g.indexOf("s/") === 0 || g.indexOf("hrs extras s") === 0) return "imp";
    if (g === "cantidad" || g === "cant" || g === "horas" || g === "hrs" || g === "total h e" || g === "total he") return "qty";
    return "";
  }

  function buildColumnMap(rows) {
    var maxScan = Math.min(rows.length, 12);
    var best = { score: -1, headerRows: 1, start: 0, map: {}, kinds: {} };
    var r;
    for (r = 0; r < maxScan; r += 1) {
      var row0 = (rows[r] || []).map(asText);
      var folded = row0.map(fold);
      var hasDni = folded.some(function (x) { return x === "dni" || x === "documento"; });
      var hasName = folded.some(function (x) {
        return x.indexOf("apellido") >= 0 || x.indexOf("nombre") >= 0 || x === "trabajador";
      });
      if (!hasDni && !hasName) continue;
      var row1 = rows[r + 1] ? rows[r + 1].map(asText) : [];
      var row2 = rows[r + 2] ? rows[r + 2].map(asText) : [];
      var widthPad = Math.max(row0.length, row1.length, row2.length, 1);
      function padRow(row) {
        var copy = row.slice();
        while (copy.length < widthPad) copy.push("");
        return copy;
      }
      row0 = padRow(row0);
      row1 = padRow(row1);
      row2 = padRow(row2);
      var filled0 = fillRight(row0);
      var filled1 = fillRight(row1);
      var three = row1.some(function (x) { return fold(x) === "cantidad" || fold(x) === "importe"; }) ||
        row2.some(function (x) { return fold(x) === "cantidad" || fold(x) === "importe"; });
      var headerRows = 1;
      var labels = filled0.slice();
      if (three && row2.length) {
        headerRows = 3;
      } else if (three) {
        headerRows = 2;
      }
      var map = {};
      var kinds = {};
      var c;
      var width = Math.max(filled0.length, filled1.length, row2.length, 1);
      for (c = 0; c < width; c += 1) {
        var a = fold(filled0[c]);
        var b = fold(filled1[c]);
        var d = fold(row2[c]);
        var ident = "";
        Object.keys(IDENTITY).forEach(function (k) {
          if (matchList(a, IDENTITY[k]) || matchList(b, IDENTITY[k])) ident = k;
        });
        if (ident) {
          map[ident] = c;
          continue;
        }
        if (matchList(a, DATE_KEYS) || matchList(b, DATE_KEYS)) { map.fecha = c; continue; }
        if (matchList(a, WEEK_KEYS) || matchList(b, WEEK_KEYS)) { map.semana = c; continue; }
        if (matchList(a, MONTH_KEYS) || matchList(b, MONTH_KEYS)) { map.mes = c; continue; }
        if (matchList(a, YEAR_KEYS) || matchList(b, YEAR_KEYS)) { map.anio = c; continue; }
        var group = headerRows === 3 ? (b || a) : (a.indexOf("ingreso") >= 0 ? b : a);
        var leaf = headerRows === 3 ? d : (headerRows === 2 ? b : "");
        var kind = incomeKind(group) || incomeKind(a) || incomeKind(b);
        var qi = qtyOrImp(leaf) || qtyOrImp(b) || qtyOrImp(a);
        if (kind === "impHeOnly") {
          map.impHe = c;
          kinds.he = true;
          continue;
        }
        if (!kind) continue;
        kinds[kind] = true;
        if (qi === "imp") map["imp" + cap(kind)] = c;
        else map["hrs" + cap(kind)] = c;
      }
      var score = Object.keys(map).length + (map.dni != null ? 5 : 0) + (map.nombres != null ? 3 : 0) + (kinds.he || kinds.he25 || kinds.he100 ? 8 : 0);
      if (score > best.score) best = { score: score, headerRows: headerRows, start: r, map: map, kinds: kinds };
    }
    return best;
  }
  function cap(kind) {
    if (kind === "he") return "He";
    if (kind === "he25") return "25";
    if (kind === "he35") return "35";
    if (kind === "he100") return "100";
    return kind;
  }
  function cell(row, idx) {
    if (idx == null || idx < 0) return "";
    return row[idx];
  }
  function emptyRecord() {
    return {
      dni: "",
      nombres: "",
      cargo: "",
      area: "",
      etapa: "",
      jornal: 0,
      fechaIngreso: "",
      fechaCese: "",
      fecha: "",
      anio: 0,
      mes: 0,
      mesNombre: "",
      semana: 0,
      hrs25: 0,
      imp25: 0,
      hrs35: 0,
      imp35: 0,
      hrs100: 0,
      imp100: 0,
      hrsHe: 0,
      impHe: 0,
      hrs: 0,
      imp: 0,
      split: false,
      hoja: "",
      fila: 0,
    };
  }
  function finalize(rec, period, hasSplit) {
    rec.nombres = asText(rec.nombres).toUpperCase();
    rec.dni = digits(rec.dni, 12);
    rec.cargo = asText(rec.cargo).toUpperCase();
    rec.area = asText(rec.area).toUpperCase();
    rec.etapa = asText(rec.etapa).toUpperCase();
    rec.jornal = money(rec.jornal);
    rec.hrs25 = hours(rec.hrs25);
    rec.hrs35 = hours(rec.hrs35);
    rec.hrs100 = hours(rec.hrs100);
    rec.hrsHe = hours(rec.hrsHe);
    rec.imp25 = money(rec.imp25);
    rec.imp35 = money(rec.imp35);
    rec.imp100 = money(rec.imp100);
    rec.impHe = money(rec.impHe);
    rec.split = !!(hasSplit && (rec.hrs25 || rec.hrs35 || rec.imp25 || rec.imp35));
    if (rec.split) {
      rec.hrs = hours(rec.hrs25 + rec.hrs35 + rec.hrs100);
      rec.imp = money(rec.imp25 + rec.imp35 + rec.imp100);
    } else {
      rec.hrs = hours(rec.hrsHe + rec.hrs100 + rec.hrs25 + rec.hrs35);
      rec.imp = money(rec.impHe + rec.imp100 + rec.imp25 + rec.imp35);
    }
    if (!rec.fecha && period && period.fecha) rec.fecha = period.fecha;
    if (rec.fecha) {
      rec.anio = rec.anio || Number(String(rec.fecha).slice(0, 4)) || isoWeekYear(rec.fecha);
      rec.mes = rec.mes || Number(String(rec.fecha).slice(5, 7));
      rec.semana = rec.semana || isoWeek(rec.fecha);
    }
    if (!rec.anio && period) rec.anio = period.anio || 0;
    if (!rec.mes && period) rec.mes = period.mes || 0;
    if (!rec.semana && period) rec.semana = period.semana || 0;
    rec.mesNombre = rec.mes ? mesNombre(rec.mes) : "";
    rec.fechaLarga = rec.fecha ? fechaLarga(rec.fecha) : "";
    return rec;
  }
  function isTotalLabel(s) {
    var f = fold(s);
    return f === "total" || f === "totales" || f.indexOf("total general") === 0;
  }
  function hasHe(rec) {
    return rec.hrs > 0.0001 || rec.imp > 0.0001;
  }
  function fingerprint(rec) {
    return [rec.dni, rec.fecha, rec.area, rec.cargo, rec.semana, rec.hrsHe, rec.impHe, rec.hrs25, rec.hrs35, rec.hrs100, rec.imp].join("|");
  }

  function parseAoA(rows, sheetName) {
    rows = rows || [];
    var period = parseSheetPeriod(sheetName || "");
    var found = buildColumnMap(rows);
    var map = found.map || {};
    var start = (found.start || 0) + (found.headerRows || 1);
    var hasSplitCols = !!(map.hrs25 != null || map.imp25 != null || map.hrs35 != null || map.imp35 != null);
    var records = [];
    var skipped = 0;
    var i;
    for (i = start; i < rows.length; i += 1) {
      var row = rows[i] || [];
      var empty = true;
      var k;
      for (k = 0; k < row.length; k += 1) {
        if (!isBlank(row[k])) { empty = false; break; }
      }
      if (empty) continue;
      var rec = emptyRecord();
      rec.nombres = asText(cell(row, map.nombres));
      rec.dni = asText(cell(row, map.dni));
      rec.cargo = asText(cell(row, map.cargo));
      rec.area = asText(cell(row, map.area));
      rec.etapa = asText(cell(row, map.etapa));
      rec.jornal = asNumber(cell(row, map.jornal));
      rec.fechaIngreso = parseDay(cell(row, map.fechaIngreso)) || asText(cell(row, map.fechaIngreso));
      rec.fechaCese = parseDay(cell(row, map.fechaCese)) || asText(cell(row, map.fechaCese));
      rec.fecha = parseDay(cell(row, map.fecha));
      rec.semana = asNumber(cell(row, map.semana)) || 0;
      rec.anio = asNumber(cell(row, map.anio)) || 0;
      if (map.mes != null) {
        var mesVal = cell(row, map.mes);
        var mi = monthIndex(mesVal);
        rec.mes = mi >= 0 ? mi + 1 : asNumber(mesVal);
      }
      rec.hrsHe = asNumber(cell(row, map.hrsHe));
      rec.impHe = asNumber(cell(row, map.impHe));
      rec.hrs25 = asNumber(cell(row, map.hrs25));
      rec.imp25 = asNumber(cell(row, map.imp25));
      rec.hrs35 = asNumber(cell(row, map.hrs35));
      rec.imp35 = asNumber(cell(row, map.imp35));
      rec.hrs100 = asNumber(cell(row, map.hrs100));
      rec.imp100 = asNumber(cell(row, map.imp100));
      rec.hoja = sheetName || "";
      rec.fila = i + 1;
      if (isTotalLabel(rec.nombres) || isTotalLabel(rec.dni)) { skipped += 1; continue; }
      if (!rec.dni && !rec.nombres) { skipped += 1; continue; }
      finalize(rec, period, hasSplitCols);
      if (!hasHe(rec)) { skipped += 1; continue; }
      records.push(rec);
    }
    return {
      ok: true,
      tipo: found.score > 0 ? "planilla" : "desconocido",
      hoja: sheetName || "",
      headerRows: found.headerRows || 0,
      columnas: Object.keys(map),
      kinds: found.kinds || {},
      records: records,
      filasLeidas: Math.max(0, rows.length - start),
      omitidas: skipped,
    };
  }

  function workbookToAoA(wb) {
    if (!wb || !wb.SheetNames) return [];
    var sheets = [];
    wb.SheetNames.forEach(function (name) {
      var ws = wb.Sheets[name];
      if (!ws) return;
      var aoa = [];
      if (root.XLSX && XLSX.utils && XLSX.utils.sheet_to_json) {
        aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      }
      sheets.push({ name: name, rows: aoa });
    });
    return sheets;
  }

  function parseWorkbook(wb) {
    var sheets = workbookToAoA(wb);
    return mergeSheets(sheets);
  }

  function mergeSheets(sheets) {
    var all = [];
    var meta = [];
    var seen = {};
    (sheets || []).forEach(function (sh) {
      var parsed = parseAoA(sh.rows || sh.values || [], sh.name);
      meta.push({
        name: parsed.hoja,
        tipo: parsed.tipo,
        filas: parsed.records.length,
        columnas: parsed.columnas,
        omitidas: parsed.omitidas,
      });
      parsed.records.forEach(function (rec) {
        var fp = fingerprint(rec);
        if (seen[fp]) return;
        seen[fp] = 1;
        all.push(rec);
      });
    });
    return {
      ok: true,
      records: all,
      sheets: meta,
      duplicadosEvitados: Object.keys(seen).length !== all.length ? 0 : 0,
      generatedAt: new Date().toISOString(),
    };
  }

  QBE.parser = {
    fold: fold,
    asNumber: asNumber,
    money: money,
    hours: hours,
    parseDay: parseDay,
    isoWeek: isoWeek,
    isoWeekYear: isoWeekYear,
    mesNombre: mesNombre,
    fechaLarga: fechaLarga,
    parseAoA: parseAoA,
    parseWorkbook: parseWorkbook,
    mergeSheets: mergeSheets,
    fingerprint: fingerprint,
    hasHe: hasHe,
    MESES: MESES,
  };
})(typeof window !== "undefined" ? window : globalThis);
