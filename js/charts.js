/* ECharts: horas por área, costo por área y costo por semana. Reutiliza instancias. */
(function (root) {
  var QBE = root.QBE || (root.QBE = {});
  var charts = {};
  var COLORS = {
    h25: "#e30613",
    h35: "#8dc63f",
    h100: "#ffd100",
    c25: "#e30613",
    c35: "#f39200",
    c100: "#8dc63f",
    week: "#8dc63f",
    text: "#4b5563",
    axis: "#9aa3ad",
  };

  function ready() {
    return typeof root.echarts !== "undefined";
  }
  function narrow() {
    return (root.innerWidth || 1200) < 900;
  }
  function get(id) {
    if (!ready()) return null;
    var el = document.getElementById(id);
    if (!el) return null;
    if (charts[id] && !charts[id].isDisposed()) return charts[id];
    charts[id] = echarts.init(el, null, { renderer: "canvas", useDirtyRect: true });
    if (typeof ResizeObserver !== "undefined" && !el._qbeRo) {
      el._qbeRo = new ResizeObserver(function () {
        if (charts[id] && !charts[id].isDisposed()) charts[id].resize();
      });
      el._qbeRo.observe(el);
    }
    return charts[id];
  }
  function money(n) {
    return QBE.kpis.fmtMoney(n);
  }
  function axisMoney(v) {
    return Number(v || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
  }
  function exactMoney(n) {
    return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function needLog(values) {
    var max = 0;
    var minPos = Infinity;
    (values || []).forEach(function (v) {
      var x = Number(v) || 0;
      if (x > max) max = x;
      if (x > 0 && x < minPos) minPos = x;
    });
    if (!(max > 0) || minPos === Infinity) return false;
    return max / minPos >= 20;
  }
  function logCeil(values) {
    var max = 1;
    (values || []).forEach(function (v) {
      var x = Number(v) || 0;
      if (x > max) max = x;
    });
    return Math.max(10, max * 1.28);
  }
  function xName(text, gap) {
    var small = narrow();
    return {
      name: text,
      nameLocation: "middle",
      nameGap: gap || (small ? 32 : 38),
      nameTextStyle: {
        color: COLORS.text,
        fontSize: small ? 11 : 12,
        fontWeight: 700,
        align: "center",
        padding: [10, 0, 0, 0],
      },
    };
  }
  function yName(text) {
    var small = narrow();
    return {
      name: text,
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: small ? 42 : 50,
      nameTextStyle: {
        color: COLORS.text,
        fontSize: small ? 11 : 12,
        fontWeight: 700,
        align: "center",
        verticalAlign: "middle",
      },
    };
  }
  function yAxis(log, isMoney) {
    var small = narrow();
    var yn = yName(isMoney ? "Importe" : "Horas");
    var base = {
      axisLabel: {
        color: COLORS.axis,
        fontSize: small ? 9 : 10,
        margin: 8,
        hideOverlap: true,
        formatter: function (v) {
          if (isMoney) return axisMoney(v);
          return axisMoney(v);
        },
      },
      splitLine: { lineStyle: { color: "#edf1f4" } },
      name: yn.name,
      nameLocation: yn.nameLocation,
      nameRotate: yn.nameRotate,
      nameGap: yn.nameGap,
      nameTextStyle: yn.nameTextStyle,
    };
    if (log) {
      base.type = "log";
      base.min = 1;
      base.logBase = 10;
    } else {
      base.type = "value";
      base.min = 0;
    }
    return base;
  }
  function labelFmt(showMoney) {
    return function (p) {
      if (!p.value || p.value < 0.009) return "";
      if (p.value < (showMoney ? 80 : 8)) return "";
      return showMoney ? money(p.value) : Number(p.value).toLocaleString("es-PE", { maximumFractionDigits: 2 });
    };
  }
  function logBase(n) {
    var i;
    var data = [];
    for (i = 0; i < n; i += 1) data.push(1);
    return {
      name: "_base",
      type: "bar",
      stack: "he",
      data: data,
      silent: true,
      tooltip: { show: false },
      label: { show: false },
      itemStyle: { color: "transparent" },
      legendHoverLink: false,
    };
  }
  function seriesBars(names, stacks, colors, moneyMode, stackName, withBase) {
    stackName = stackName || "he";
    var small = narrow();
    var list = names.map(function (name, i) {
      return {
        name: name,
        type: "bar",
        stack: stackName,
        barMinWidth: small ? 22 : 28,
        barMaxWidth: small ? 48 : 64,
        barCategoryGap: "14%",
        data: stacks[i],
        itemStyle: { color: colors[i], borderRadius: i === names.length - 1 ? [2, 2, 0, 0] : 0 },
        label: {
          show: true,
          position: "inside",
          color: colors[i] === COLORS.h100 ? "#1b1f24" : "#fff",
          fontWeight: 700,
          fontSize: moneyMode ? (small ? 9 : 10) : (small ? 10 : 11),
          hideOverlap: true,
          formatter: labelFmt(moneyMode),
        },
        emphasis: { focus: "series" },
      };
    });
    if (withBase) list.unshift(logBase((stacks[0] || []).length));
    return list;
  }
  function gridBox(extra) {
    var small = narrow();
    var g = {
      left: small ? 52 : 60,
      right: small ? 12 : 16,
      top: small ? 32 : 36,
      bottom: small ? 36 : 40,
      containLabel: true,
    };
    if (extra) Object.keys(extra).forEach(function (k) { g[k] = extra[k]; });
    return g;
  }
  function xAxisArea(areas) {
    var small = narrow();
    var xn = xName("Área", small ? 46 : 50);
    return {
      type: "category",
      data: areas,
      name: xn.name,
      nameLocation: xn.nameLocation,
      nameGap: xn.nameGap,
      nameTextStyle: xn.nameTextStyle,
      axisLabel: {
        rotate: small ? 28 : 18,
        color: COLORS.text,
        fontSize: small ? 9 : 10,
        interval: 0,
        margin: 6,
        hideOverlap: false,
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#d9e0e7" } },
    };
  }
  function slug(s) {
    return String(s || "grafico")
      .toLowerCase()
      .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "grafico";
  }
  function downloadPng(id, title) {
    var ch = get(id);
    if (!ch) return;
    var url = "";
    try {
      url = ch.getDataURL({
        type: "png",
        pixelRatio: 3,
        backgroundColor: "#ffffff",
      });
    } catch (err) {
      if (QBE.shell && QBE.shell.toast) QBE.shell.toast("No se pudo descargar el gráfico", true);
      return;
    }
    var a = document.createElement("a");
    a.href = url;
    a.download = slug(title) + ".png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (QBE.audit) QBE.audit.add("Descargar gráfico", title || id);
    if (QBE.shell && QBE.shell.toast) QBE.shell.toast("Imagen en alta calidad");
  }
  function bind() {
    if (bind.ok) return;
    bind.ok = true;
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-chart-dl]") : null;
      if (!btn) return;
      downloadPng(btn.getAttribute("data-chart-dl"), btn.getAttribute("data-title") || "grafico");
    });
  }

  function updateHoursArea(agg) {
    var ch = get("chart-hrs-area");
    if (!ch) return;
    var areas = agg.areas || [];
    var split = agg.split;
    var s25 = [];
    var s35 = [];
    var s100 = [];
    var sHe = [];
    var totals = [];
    areas.forEach(function (a) {
      var x = agg.byArea[a] || {};
      s25.push(x.hrs25 || 0);
      s35.push(x.hrs35 || 0);
      s100.push(x.hrs100 || 0);
      sHe.push(x.hrsHe || 0);
      totals.push(x.hrs || 0);
    });
    function nz(arr) { return arr.map(function (v) { return v > 0 ? v : null; }); }
    var names = split ? ["HRS. 25%", "HRS. 35%", "HRS. 100%"] : ["HORAS EXTRAS", "HRS. 100%"];
    var stacks = split ? [nz(s25), nz(s35), nz(s100)] : [nz(sHe.map(function (v, i) { return v + (s25[i] || 0) + (s35[i] || 0); })), nz(s100)];
    var colors = split ? [COLORS.h25, COLORS.h35, COLORS.h100] : [COLORS.h25, COLORS.h100];
    var log = needLog(totals);
    var ya = yAxis(log, false);
    if (log) ya.max = logCeil(totals);
    var small = narrow();
    ch.setOption({
      animationDuration: 280,
      animationDurationUpdate: 220,
      color: colors,
      grid: gridBox(),
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (items) {
          items = (items || []).filter(function (it) { return it.seriesName !== "_base"; });
          if (!items.length) return "";
          var t = items[0].axisValue;
          var sum = 0;
          var lines = items.map(function (it) {
            sum += Number(it.value) || 0;
            return it.marker + " " + it.seriesName + ": <b>" + (Number(it.value) || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 }) + " h</b>";
          });
          return t + "<br/>" + lines.join("<br/>") + "<br/>Total: <b>" + sum.toLocaleString("es-PE", { maximumFractionDigits: 2 }) + " h</b>";
        },
      },
      xAxis: xAxisArea(areas),
      legend: {
        top: 0,
        left: "center",
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 10,
        textStyle: { fontSize: small ? 10 : 11, color: COLORS.text },
        data: names,
      },
      yAxis: ya,
      series: seriesBars(names, stacks, colors, false, "he", log),
    }, { notMerge: true });
  }

  function updateCostArea(agg) {
    var ch = get("chart-cost-area");
    if (!ch) return;
    var areas = agg.areas || [];
    var split = agg.split;
    var s25 = [];
    var s35 = [];
    var s100 = [];
    var sHe = [];
    var totals = [];
    areas.forEach(function (a) {
      var x = agg.byArea[a] || {};
      s25.push(x.imp25 || 0);
      s35.push(x.imp35 || 0);
      s100.push(x.imp100 || 0);
      sHe.push(x.impHe || 0);
      totals.push(x.imp || 0);
    });
    function nz(arr) { return arr.map(function (v) { return v > 0 ? v : null; }); }
    var names = split ? ["HE 25%", "HE 35%", "HE 100%"] : ["HORAS EXTRAS", "HE 100%"];
    var stacks = split ? [nz(s25), nz(s35), nz(s100)] : [nz(sHe.map(function (v, i) { return v + (s25[i] || 0) + (s35[i] || 0); })), nz(s100)];
    var colors = split ? [COLORS.c25, COLORS.c35, COLORS.c100] : [COLORS.c25, COLORS.c100];
    var log = needLog(totals);
    var ya = yAxis(log, true);
    if (log) ya.max = logCeil(totals);
    var small = narrow();
    ch.setOption({
      animationDuration: 280,
      animationDurationUpdate: 220,
      color: colors,
      grid: gridBox(),
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (items) {
          items = (items || []).filter(function (it) { return it.seriesName !== "_base"; });
          if (!items.length) return "";
          var t = items[0].axisValue;
          var sum = 0;
          var lines = items.map(function (it) {
            sum += Number(it.value) || 0;
            return it.marker + " " + it.seriesName + ": <b>" + money(it.value) + "</b>";
          });
          return t + "<br/>" + lines.join("<br/>") + "<br/>Total: <b>" + money(sum) + "</b>";
        },
      },
      xAxis: xAxisArea(areas),
      legend: {
        top: 0,
        left: "center",
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 10,
        textStyle: { fontSize: small ? 10 : 11, color: COLORS.text },
        data: names,
      },
      yAxis: ya,
      series: seriesBars(names, stacks, colors, true, "cost", log).map(function (s) {
        if (s.name === "_base") { s.stack = "cost"; return s; }
        s.stack = "cost";
        s.label.fontSize = small ? 9 : 10;
        s.label.fontWeight = 700;
        s.label.hideOverlap = true;
        s.label.formatter = function (p) {
          if (!p.value || p.value < 80) return "";
          return money(p.value);
        };
        return s;
      }),
    }, { notMerge: true });
  }

  function updateWeek(agg) {
    var ch = get("chart-week");
    if (!ch) return;
    var rows = (agg.weeks || []).slice();
    var cats = rows.map(function (r) { return "Semana " + r.semana; });
    var data = rows.map(function (r) { return r.imp; });
    var maxImp = 0;
    data.forEach(function (v) { if (Number(v) > maxImp) maxImp = Number(v); });
    var xMax = Math.ceil((maxImp || 1) * 1.12 / 100) * 100;
    var small = narrow();
    var xn = xName("Importe (S/.)", small ? 28 : 32);
    var yn = yName("");
    ch.setOption({
      animationDuration: 280,
      grid: gridBox({ top: 18, right: small ? 14 : 20, bottom: small ? 40 : 46, left: small ? 12 : 16 }),
      tooltip: {
        trigger: "axis",
        formatter: function (items) {
          var it = items && items[0];
          if (!it) return "";
          var row = rows[it.dataIndex] || {};
          return "Semana " + row.semana +
            "<br/>Horas: <b>" + (row.hrs || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 }) + "</b>" +
            "<br/>Costo: <b>" + money(row.imp) + "</b>" +
            "<br/>Colaboradores: <b>" + (row.colaboradores || 0) + "</b>";
        },
      },
      dataZoom: rows.length > 8 ? [{ type: "inside", yAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseMove: true }] : [],
      xAxis: {
        type: "value",
        min: 0,
        max: xMax,
        name: xn.name,
        nameLocation: xn.nameLocation,
        nameGap: xn.nameGap,
        nameTextStyle: xn.nameTextStyle,
        splitNumber: small ? 4 : 5,
        axisLabel: {
          color: COLORS.axis,
          fontSize: small ? 9 : 10,
          margin: 8,
          hideOverlap: true,
          formatter: function (v) { return "S/ " + axisMoney(v); },
        },
        splitLine: { lineStyle: { color: "#edf1f4" } },
      },
      yAxis: {
        type: "category",
        data: cats,
        name: yn.name,
        nameLocation: yn.nameLocation,
        nameRotate: yn.nameRotate,
        nameGap: yn.nameGap,
        nameTextStyle: yn.nameTextStyle,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: COLORS.text, fontSize: small ? 11 : 12, margin: 8 },
      },
      series: [{
        type: "bar",
        data: data,
        barMinWidth: small ? 26 : 32,
        barMaxWidth: small ? 40 : 48,
        barCategoryGap: "16%",
        itemStyle: { color: COLORS.week, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: "insideRight",
          color: "#fff",
          fontWeight: 700,
          fontSize: small ? 10 : 11,
          formatter: function (p) {
            if (!p.value) return "";
            if (p.value < maxImp * 0.12) return "";
            return money(p.value);
          },
        },
      }],
    }, { notMerge: true });
  }

  function update(agg) {
    bind();
    if (!ready()) return;
    updateHoursArea(agg);
    updateCostArea(agg);
    updateWeek(agg);
    if (root.requestAnimationFrame) {
      root.requestAnimationFrame(function () { resize(); });
    } else {
      setTimeout(resize, 40);
    }
  }

  function resize() {
    Object.keys(charts).forEach(function (id) {
      if (charts[id] && !charts[id].isDisposed()) charts[id].resize();
    });
  }

  function dispose() {
    Object.keys(charts).forEach(function (id) {
      if (charts[id] && !charts[id].isDisposed()) charts[id].dispose();
    });
    charts = {};
  }

  QBE.charts = { update: update, resize: resize, dispose: dispose, get: get, download: downloadPng, bind: bind };
})(typeof window !== "undefined" ? window : globalThis);
