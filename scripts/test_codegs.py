# -*- coding: utf-8 -*-
"""Prueba Code.gs: parser local con mocks de Apps Script + API publicada."""
from __future__ import print_function

import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CODE_PATH = os.path.join(ROOT, "gas", "Code.gs")
API = "https://script.google.com/macros/s/AKfycbyQBy1Hc0wV4UwOt7wFou-8c5BroxpOCdqi0TmM-9hzdhDg0LzZFx-lqHbj4wqYHeDGig/exec"

fails = 0
oks = 0


def ok(cond, msg):
    global fails, oks
    if cond:
        oks += 1
        print("ok  ", msg)
    else:
        fails += 1
        print("FAIL", msg)


def http_json(method, url, body=None, timeout=40):
    data = None
    headers = {"User-Agent": "QBerries-CodeGs-Test/1.0", "Accept": "application/json"}
    if body is not None:
        raw = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "text/plain;charset=utf-8"
        req = urllib.request.Request(url, data=raw, headers=headers, method=method)
    else:
        req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            text = res.read().decode("utf-8", "replace")
            parsed = None
            try:
                parsed = json.loads(text) if text else None
            except json.JSONDecodeError:
                parsed = None
            return res.status, parsed, text[:400]
    except urllib.error.HTTPError as err:
        text = err.read().decode("utf-8", "replace")
        parsed = None
        try:
            parsed = json.loads(text) if text else None
        except json.JSONDecodeError:
            parsed = None
        return err.code, parsed, text[:400]


def unwrap(out):
    if out is None:
        return None
    if hasattr(out, "data"):
        return out.data
    if isinstance(out, dict):
        return out
    return out


def build_runtime(code_src):
    import js2py

    mock = r"""
var _cache = {};
var _props = {};
var _lock = { waitLock: function(){}, releaseLock: function(){} };
var LockService = { getScriptLock: function(){ return _lock; } };
var CacheService = {
  getScriptCache: function(){
    return {
      get: function(k){ return _cache[k] || null; },
      put: function(k,v){ _cache[k]=v; },
      remove: function(k){ delete _cache[k]; }
    };
  }
};
var PropertiesService = {
  getScriptProperties: function(){
    return {
      getProperty: function(k){ return _props[k] || null; },
      setProperty: function(k,v){ _props[k]=v; return this; }
    };
  }
};
var ContentService = {
  MimeType: { JSON: 'JSON' },
  createTextOutput: function(s){
    return {
      _raw: s,
      data: JSON.parse(s || '{}'),
      setMimeType: function(){ return this; }
    };
  }
};
function _fmt(d, fmt){
  var date = (d instanceof Date) ? d : new Date(d);
  var y = date.getFullYear();
  var m = ('0'+(date.getMonth()+1)).slice(-2);
  var day = ('0'+date.getDate()).slice(-2);
  var h = ('0'+date.getHours()).slice(-2);
  var mi = ('0'+date.getMinutes()).slice(-2);
  var s = ('0'+date.getSeconds()).slice(-2);
  if (fmt === 'yyyy-MM-dd') return y+'-'+m+'-'+day;
  if (fmt === 'dd-MM-yyyy HH:mm:ss') return day+'-'+m+'-'+y+' '+h+':'+mi+':'+s;
  return y+'-'+m+'-'+day;
}
var Utilities = { formatDate: function(d, tz, fmt){ return _fmt(d, fmt); } };
var _sheets = [];
function _sheet(name, values){
  values = values || [];
  var width = 0;
  var r;
  for (r=0;r<values.length;r++) if (values[r].length>width) width=values[r].length;
  return {
    getName: function(){ return name; },
    getLastRow: function(){ return values.length; },
    getLastColumn: function(){ return width; },
    getRange: function(r1,c1,r2,c2){
      return {
        getValues: function(){
          var out=[], i, j, row;
          for (i=r1-1;i<r1-1+r2 && i<values.length;i++){
            row=[];
            for (j=c1-1;j<c1-1+c2;j++) row.push(values[i][j] != null ? values[i][j] : '');
            out.push(row);
          }
          return out;
        },
        setValues: function(){ return this; },
        setFontWeight: function(){ return this; },
        setBackground: function(){ return this; },
        setFontColor: function(){ return this; }
      };
    },
    setFrozenRows: function(){},
    clear: function(){ values = []; },
    insertSheet: function(){ return this; }
  };
}
var SpreadsheetApp = {
  openById: function(){ throw new Error('no'); },
  getActive: function(){
    return {
      getId: function(){ return 'ss-test'; },
      getUrl: function(){ return 'https://docs.google.com/spreadsheets/d/ss-test'; },
      getSheets: function(){ return _sheets; },
      getSheetByName: function(n){
        var i;
        for (i=0;i<_sheets.length;i++) if (_sheets[i].getName()===n) return _sheets[i];
        return null;
      },
      insertSheet: function(n){
        var sh = _sheet(n, []);
        _sheets.push(sh);
        return sh;
      }
    };
  },
  create: function(){ return SpreadsheetApp.getActive(); }
};
function setTestSheets(list){ _sheets = list; _cache = {}; }
function makeSheet(name, values){ return _sheet(name, values); }
"""
    ctx = js2py.EvalJs()
    ctx.execute(mock)
    ctx.execute(code_src)
    return ctx


def sample_planilla():
    return [
        ["Apellidos y Nombres", "DNI", "Fecha Ingreso", "Fecha Cese", "Cargo", "ÁREA", "ETAPA", "JORNAL", "Ingresos"],
        ["", "", "", "", "", "", "", "", "HORAS EXTRAS", "", "Horas 100%", "", "B.Asistencia"],
        ["", "", "", "", "", "", "", "", "Cantidad", "Importe", "Cantidad", "Importe", "Cantidad", "Importe"],
        ["PEREZ RAMOS LUIS", "12345678", "01/01/2025", "", "OBRERO", "SANIDAD", "", 52.47, 2, 13.12, 1, 13.12, 0, 0],
        ["Total", "", "", "", "", "", "", "", 2, 13.12, 1, 13.12, 0, 0],
        ["SIN HORAS", "11111111", "", "", "OBRERO", "RIEGO", "", 50, 0, 0, 0, 0, 0, 0],
        ["QUISPE ANA", "87654321", "02/02/2025", "", "AUXILIAR", "RIEGO", "", 48, 4, 26.24, 0, 0, 0, 0],
    ]


def sample_detalle():
    return [
        ["DNI", "Apellidos y Nombres", "ÁREA", "CARGO", "MES", "SEMANA", "F-TRABAJO", "HRS. 25%", "IMP. 25%", "Horas 100%", "IMP. 100%"],
        ["62257759", "AGUILAR DELFIN JERSON JAMPIER", "SANIDAD", "AUXILIAR", "Marzo", 11, "09/03/2026", 0, 2.45, 0, 0],
    ]


def test_static(src):
    print("\n== Contrato Code.gs ==")
    for fn in ["doGet", "doPost", "handle_", "login_", "instalar", "json_", "parseBody_", "getSpreadsheet", "loadPack_", "parseAoA_", "buildColumnMap_"]:
        ok(re.search(r"function\s+" + fn + r"\s*\(", src) is not None, "existe " + fn)
    ok('CLAVE_ACCESO = "eduardo2026"' in src, "clave eduardo2026")
    ok('USUARIO_ACCESO = "Administrador"' in src, "usuario Administrador")
    ok("/^config/i.test(name)" in src, "omite hoja Config")
    ok("HORAS EXTRAS" in src and "Horas 100%" in src, "encabezados reales HE y 100%")
    ok("B.Asistencia" in src and "no inventa" in src.lower() or "No inventa" in src, "no inventa horas")
    ok("LockService.getScriptLock" in src, "usa LockService")
    ok("CacheService.getScriptCache" in src, "usa CacheService")


def test_local(ctx):
    print("\n== Parser local (mocks Apps Script) ==")
    recs = ctx.parseAoA_(sample_planilla(), "PlanillaGeneralDetallado")
    recs = unwrap(recs) if not isinstance(recs, dict) else recs
    # js2py may return JsObject
    if hasattr(recs, "to_dict"):
        recs = recs.to_dict()
    elif hasattr(recs, "to_python"):
        recs = recs.to_python()
    ok(int(recs["records"].__len__() if hasattr(recs["records"], "__len__") else len(list(recs["records"]))) == 2, "solo filas con HE, sin Total ni ceros")
    rows = list(recs["records"])
    first = rows[0]
    if hasattr(first, "to_dict"):
        first = first.to_dict()
    ok(str(first["dni"]) == "12345678", "DNI exacto")
    ok(str(first["area"]) == "SANIDAD", "área SANIDAD")
    ok(float(first["hrsHe"]) == 2, "HORAS EXTRAS cantidad 2")
    ok(float(first["impHe"]) == 13.12, "HORAS EXTRAS importe 13.12")
    ok(float(first["hrs100"]) == 1, "Horas 100% cantidad")
    ok(abs(float(first["hrs"]) - 3) < 0.001, "total horas = extras + 100%")
    ok(abs(float(first["imp"]) - 26.24) < 0.001, "total importe = extras + 100%")
    ok("hrs25" in first and float(first.get("hrs25") or 0) == 0, "no inventa 25% si no hay columna")

    det = ctx.parseAoA_(sample_detalle(), "DETALLE_HE")
    if hasattr(det, "to_dict"):
        det = det.to_dict()
    elif hasattr(det, "to_python"):
        det = det.to_python()
    ok(len(list(det["records"])) == 1, "detalle con importe y 0 horas entra")
    d0 = list(det["records"])[0]
    if hasattr(d0, "to_dict"):
        d0 = d0.to_dict()
    ok(int(d0["semana"]) == 11, "semana 11")
    ok(int(d0["mes"]) == 3, "mes Marzo = 3")
    ok(str(d0["fecha"]) == "2026-03-09", "F-TRABAJO 2026-03-09")
    ok(abs(float(d0["imp25"]) - 2.45) < 0.001, "importe 25% sin inventar horas")

    ping = unwrap(ctx.doGet({"parameter": {"action": "ping"}}))
    if hasattr(ping, "data"):
        ping = ping.data
    if hasattr(ping, "to_dict"):
        ping = ping.to_dict()
    ok(bool(ping.get("ok")) and ping.get("app") == "QBerries Horas Extras", "doGet ping")

    login_ok = ctx.login_({"usuario": "Administrador", "clave": "eduardo2026"})
    if hasattr(login_ok, "to_dict"):
        login_ok = login_ok.to_dict()
    ok(bool(login_ok.get("ok")) and login_ok.get("data", {}).get("id") == "USR-ADMIN", "login correcto")

    login_bad = ctx.login_({"usuario": "Administrador", "clave": "mala"})
    if hasattr(login_bad, "to_dict"):
        login_bad = login_bad.to_dict()
    ok(login_bad.get("ok") is False and login_bad.get("error") == "clave_invalida", "login clave inválida")

    planilla = ctx.makeSheet("PlanillaGeneralDetallado", sample_planilla())
    cfg = ctx.makeSheet("Config", [["k", "v"]])
    dup = ctx.makeSheet("Copia marzo", sample_planilla())
    vacia = ctx.makeSheet("Hoja 1", [])
    ctx.setTestSheets([planilla, cfg, dup, vacia])
    pack = ctx.loadPack_()
    if hasattr(pack, "to_dict"):
        pack = pack.to_dict()
    elif hasattr(pack, "to_python"):
        pack = pack.to_python()
    names = [s.get("name") if isinstance(s, dict) else str(s) for s in pack.get("sheets", [])]
    ok("Config" not in names, "Config no entra al pack")
    ok(int(pack.get("total") or 0) == 2, "dedup entre hojas iguales = 2 registros")
    ok(pack.get("ok") is True, "loadPack ok")

    empty = ctx.parseAoA_(sample_planilla()[:3], "PlanillaGeneralDetallado")
    if hasattr(empty, "to_dict"):
        empty = empty.to_dict()
    ok(len(list(empty["records"])) == 0, "solo encabezados no rompe")

    unknown = unwrap(ctx.handle_("borrar", {}))
    if hasattr(unknown, "data"):
        unknown = unknown.data
    if hasattr(unknown, "to_dict"):
        unknown = unknown.to_dict()
    ok(unknown.get("error") == "accion_desconocida", "acción desconocida")


def py_get(obj, key, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    try:
        return obj[key]
    except Exception:
        return getattr(obj, key, default)


def test_local_safe(ctx):
    """Misma suite, extrayendo valores con js2py de forma defensiva."""
    print("\n== Parser local (mocks Apps Script) ==")

    def js(expr):
        return ctx.eval(expr)

    ctx.samplePlanilla = sample_planilla()
    ctx.sampleDetalle = sample_detalle()
    recs = js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado')")
    n = int(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records.length"))
    ok(n == 2, "solo filas con HE, sin Total ni ceros")
    ok(str(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].dni")) == "12345678", "DNI exacto")
    ok(str(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].area")) == "SANIDAD", "área SANIDAD")
    ok(float(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].hrsHe")) == 2, "HORAS EXTRAS cantidad 2")
    ok(float(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].impHe")) == 13.12, "HORAS EXTRAS importe 13.12")
    ok(float(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].hrs100")) == 1, "Horas 100% cantidad")
    ok(abs(float(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].hrs")) - 3) < 0.001, "total horas = extras + 100%")
    ok(abs(float(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].imp")) - 26.24) < 0.001, "total importe = extras + 100%")
    ok(float(js("parseAoA_(samplePlanilla, 'PlanillaGeneralDetallado').records[0].hrs25")) == 0, "no inventa 25%")

    ok(int(js("parseAoA_(sampleDetalle, 'DETALLE_HE').records.length")) == 1, "detalle con importe y 0 horas entra")
    ok(int(js("parseAoA_(sampleDetalle, 'DETALLE_HE').records[0].semana")) == 11, "semana 11")
    ok(int(js("parseAoA_(sampleDetalle, 'DETALLE_HE').records[0].mes")) == 3, "mes Marzo = 3")
    ok(str(js("parseAoA_(sampleDetalle, 'DETALLE_HE').records[0].fecha")) == "2026-03-09", "F-TRABAJO 2026-03-09")
    ok(abs(float(js("parseAoA_(sampleDetalle, 'DETALLE_HE').records[0].imp25")) - 2.45) < 0.001, "importe 25% sin inventar horas")

    ping = js("doGet({parameter:{action:'ping'}}).data")
    ok(bool(py_get(ping, "ok")) and str(py_get(ping, "app")) == "QBerries Horas Extras", "doGet ping")

    ok(bool(js("login_({usuario:'Administrador', clave:'eduardo2026'}).ok")), "login correcto")
    ok(str(js("login_({usuario:'Administrador', clave:'mala'}).error")) == "clave_invalida", "login clave inválida")

    js("setTestSheets([makeSheet('PlanillaGeneralDetallado', samplePlanilla), makeSheet('Config', [['k','v']]), makeSheet('Copia marzo', samplePlanilla), makeSheet('Hoja 1', [])])")
    ok(int(js("loadPack_().total")) == 2, "dedup entre hojas iguales = 2 registros")
    ok(bool(js("loadPack_().ok")), "loadPack ok")
    ok(int(js("(function(){ var s=loadPack_().sheets; var i; for(i=0;i<s.length;i++) if(s[i].name==='Config') return 1; return 0; })()")) == 0, "Config no entra al pack")
    ok(int(js("parseAoA_(samplePlanilla.slice(0,3), 'PlanillaGeneralDetallado').records.length")) == 0, "solo encabezados no rompe")
    ok(str(js("handle_('borrar', {}).data.error")) == "accion_desconocida", "acción desconocida")


def test_live():
    print("\n== API publicada ==")
    st, data, raw = http_json("GET", API + "?action=ping")
    ok(st == 200 and isinstance(data, dict) and data.get("ok") is True, "GET ping 200 ok")
    ok(data and data.get("app") == "QBerries Horas Extras", "GET ping app QBerries")
    ok(data and data.get("tz") == "America/Lima", "GET ping tz Lima")

    st, data, raw = http_json("GET", API)
    ok(st == 200 and data and data.get("ok") is True and data.get("app") == "QBerries Horas Extras", "GET sin action = ping")

    st, data, raw = http_json("GET", API + "?action=he")
    ok(st == 200 and isinstance(data, dict) and data.get("ok") is True, "GET he 200 ok")
    ok(isinstance((data or {}).get("records"), list), "GET he trae records[]")
    ok(isinstance((data or {}).get("sheets"), list), "GET he trae sheets[]")
    ok("total" in (data or {}), "GET he trae total")
    ok("generatedAt" in (data or {}), "GET he trae generatedAt")
    recs = (data or {}).get("records") or []
    ok(all("dni" in r and "hrs" in r and "imp" in r for r in recs) if recs else True, "records con dni/hrs/imp si hay filas")
    invented = any(float(r.get("hrs25") or 0) and "25" not in json.dumps((data or {}).get("sheets")) for r in recs)
    ok(not invented, "no inventa 25% si las hojas no lo tienen")
    print("     live total=", (data or {}).get("total"), "sheets=", [s.get("name") for s in (data or {}).get("sheets") or []])

    st, data, raw = http_json("GET", API + "?action=meta")
    ok(st == 200 and data and data.get("ok") is True and "records" not in data, "GET meta sin records")
    ok(isinstance((data or {}).get("sheets"), list), "GET meta sheets")

    st, data, raw = http_json("POST", API, {"action": "login", "payload": {"usuario": "Administrador", "clave": "eduardo2026"}})
    ok(st == 200 and data and data.get("ok") is True, "POST login correcto")
    ok(data and (data.get("data") or {}).get("id") == "USR-ADMIN", "POST login id USR-ADMIN")

    st, data, raw = http_json("POST", API, {"action": "login", "payload": {"usuario": "Administrador", "clave": "no"}})
    ok(st == 200 and data and data.get("ok") is False and data.get("error") == "clave_invalida", "POST login rechaza clave mala")

    st, data, raw = http_json("POST", API, {"action": "he", "payload": {}})
    ok(st == 200 and data and data.get("ok") is True and isinstance(data.get("records"), list), "POST he igual que GET")

    st, data, raw = http_json("POST", API, {"action": "borrar", "payload": {}})
    ok(st == 200 and data and data.get("error") == "accion_desconocida", "POST acción desconocida")


def main():
    with open(CODE_PATH, "r", encoding="utf-8") as f:
        src = f.read()
    test_static(src)
    test_live()
    print("\n%d ok, %d fail" % (oks, fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
