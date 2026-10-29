/* S7+ Central Asia Tracker: client app. No dependencies. */
(function () {
  "use strict";
  var CFG = window.S7CAT_CONFIG;
  var ROOT = document.querySelector(".s7cat");
  var SCORED = CFG.scoredCountries;
  var SECTORS = CFG.sectors;
  var ACTORS = CFG.actors;
  var ACTOR = {}; ACTORS.forEach(function (a) { ACTOR[a.key] = a; });
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MON = MONTHS.map(function (m) { return m.slice(0, 3); });
  var LEVEL_LABEL = { 0: "Rated 0", 1: "Meeting / status quo", 2: "Agreement or summit", 3: "Tangible outcome", 4: "Major outcome" };
  var BANDS = [
    { key: "b1", label: "Low", range: "0–24", dark: false },
    { key: "b2", label: "Moderate", range: "25–49", dark: false },
    { key: "b3", label: "High", range: "50–74", dark: true },
    { key: "b4", label: "Very high", range: "75–100", dark: true }
  ];
  var NOBAND = { key: "b0", label: "No incidents", dark: false };
  var BANDHEX = { b0: "#F4F3EF", b1: "#E4DEF0", b2: "#B3A3D3", b3: "#7A63AC", b4: "#46317A" };
  var REGION = "Region-wide";

  if (/(^|[?&])embed=1/.test(location.search) || location.hash === "#embed") ROOT.classList.add("embed");

  var state = { period: null, actor: "all", sector: "all", loc: "all", search: "", sort: "date", shown: 15, selected: null };
  var DATA = [], MONTH_KEYS = [], GEO = null, REPORTS = [];

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function monthLabel(k, short) { var p = k.split("-"); return (short ? MON : MONTHS)[+p[1] - 1] + " " + p[0]; }
  function periodLabel() { return state.period === "ytd" ? (MONTH_KEYS.length ? MONTH_KEYS[0].slice(0, 4) : "") + " to date" : monthLabel(state.period); }
  function band(score) { if (score == null) return NOBAND; return BANDS[score < 25 ? 0 : score < 50 ? 1 : score < 75 ? 2 : 3]; }
  function fmt(score) { return score == null ? "–" : String(Math.round(score)); }
  function bandChip(score) { var b = band(score); return '<span class="band" style="background:' + BANDHEX[b.key] + ";color:" + (b.dark ? "#fff" : "#1B1725") + '">' + b.label + "</span>"; }
  function sevValue(s) { if (s == null) return null; return (Math.min(4, Math.max(1, s)) - 1) / 3 * 100; }
  function locKey(inc) { return inc.scored ? inc.location : (inc.location && !/central asia/i.test(inc.location) ? inc.location : REGION); }
  function fmtDate(iso) { var p = iso.split("-"); return MON[+p[1] - 1] + " " + (+p[2]) + ", " + p[0]; }
  function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "Source"; } }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /* ---------- filtering + scoring ---------- */
  function inPeriod(inc, period) { return period === "ytd" ? true : inc.date.slice(0, 7) === period; }
  function filter(opts) {
    var o = Object.assign({ period: state.period, actor: state.actor, sector: state.sector, loc: state.loc }, opts || {});
    return DATA.filter(function (inc) {
      if (!inPeriod(inc, o.period)) return false;
      if (o.actor !== "all" && inc.actors.indexOf(o.actor) < 0) return false;
      if (o.sector !== "all" && inc.types.indexOf(o.sector) < 0) return false;
      if (o.loc !== "all" && locKey(inc) !== o.loc) return false;
      return true;
    });
  }
  // Country score: mean over sectors (equal weight) of mean rescaled severity in that sector.
  function score(incs, sector) {
    var by = {};
    incs.forEach(function (inc) {
      var v = sevValue(inc.severity); if (v == null) return;
      inc.types.forEach(function (t) { if (sector && sector !== "all" && t !== sector) return; (by[t] = by[t] || []).push(v); });
    });
    var types = Object.keys(by), sectorScores = {};
    types.forEach(function (t) { var a = by[t]; sectorScores[t] = { score: a.reduce(function (s, x) { return s + x; }, 0) / a.length, n: a.length }; });
    var overall = types.length ? types.reduce(function (s, t) { return s + sectorScores[t].score; }, 0) / types.length : null;
    return { score: overall, n: incs.length, sectors: sectorScores };
  }
  function countryScore(country, opts) { var o = Object.assign({}, opts || {}, { loc: country }); return score(filter(o), o.sector != null ? o.sector : state.sector); }
  // Region score: mean of the five country scores that have data.
  function regionScore(opts) {
    var vals = [], n = 0;
    SCORED.forEach(function (c) { var s = countryScore(c, opts); n += s.n; if (s.score != null) vals.push(s.score); });
    return { score: vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null, n: n };
  }
  function scopeScore(opts) { var loc = (opts && opts.loc) || state.loc; return loc === "all" ? regionScore(opts) : countryScore(loc, opts); }
  function prevMonth(k) { var i = MONTH_KEYS.indexOf(k); return i >= 0 && i < MONTH_KEYS.length - 1 ? MONTH_KEYS[i + 1] : null; }
  function chronoMonths() { return MONTH_KEYS.slice().reverse(); }

  /* ---------- tooltip ---------- */
  var tip = $("tooltip");
  function showTip(html, ev) {
    tip.innerHTML = html; tip.hidden = false;
    var r = tip.getBoundingClientRect(), x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- data loading ---------- */
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  var TYPE_NORM = {}; SECTORS.forEach(function (s) { TYPE_NORM[s.toLowerCase()] = s; });
  function normalizeCSV(text) {
    var rows = parseCSV(text), h = rows.shift().map(function (x) { return x.trim().toLowerCase(); });
    function col(name) { return h.indexOf(name.toLowerCase()); }
    var C = { date: col("Date & Time"), type: col("Type"), sev: col("Severity"), loc: col("Location"), title: col("Title"), desc: col("Description"), link: col("Link"), hide: col("Hide") };
    var out = [];
    rows.forEach(function (r, i) {
      var d = (r[C.date] || "").trim(); if (!d) return;
      if (C.hide >= 0 && /^true$/i.test((r[C.hide] || "").trim())) return;
      var m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return;
      var loc = (r[C.loc] || "").replace(/\s+/g, " ").trim();
      var sev = parseInt(r[C.sev], 10);
      out.push({
        row: i + 2, date: m[3] + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2),
        types: (r[C.type] || "").split(",").map(function (t) { return TYPE_NORM[t.trim().toLowerCase()]; }).filter(Boolean),
        severity: isNaN(sev) ? null : sev, location: loc, scored: SCORED.indexOf(loc) >= 0,
        actors: ACTORS.map(function (a) { return a.key; }).filter(function (k) { var j = col(k); return j >= 0 && /^true$/i.test((r[j] || "").trim()); }),
        title: (r[C.title] || "").replace(/\s+/g, " ").trim(), description: (r[C.desc] || "").replace(/\s+/g, " ").trim(), link: (r[C.link] || "").trim()
      });
    });
    return out;
  }
  function loadJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  function loadIncidents() {
    if (CFG.sheetCsvUrl) {
      return fetch(CFG.sheetCsvUrl).then(function (r) { if (!r.ok) throw new Error("sheet"); return r.text(); })
        .then(function (t) { return { incidents: normalizeCSV(t), live: true }; })
        .catch(function () { return loadJSON(CFG.dataUrl); });
    }
    return loadJSON(CFG.dataUrl);
  }

  /* ---------- controls ---------- */
  function buildControls() {
    var ps = $("periodSelect");
    ps.innerHTML = MONTH_KEYS.map(function (k) { return '<option value="' + k + '">' + monthLabel(k) + "</option>"; }).join("") +
      '<option value="ytd">' + (MONTH_KEYS[0] || "").slice(0, 4) + " to date</option>";
    ps.onchange = function () { set({ period: ps.value }); };
    $("prevPeriod").onclick = function () { var i = MONTH_KEYS.indexOf(state.period); if (state.period === "ytd") set({ period: MONTH_KEYS[0] }); else if (i < MONTH_KEYS.length - 1) set({ period: MONTH_KEYS[i + 1] }); };
    $("nextPeriod").onclick = function () { var i = MONTH_KEYS.indexOf(state.period); if (i > 0) set({ period: MONTH_KEYS[i - 1] }); };
    var seg = $("actorSeg");
    seg.innerHTML = '<button data-a="all">All actors</button>' + ACTORS.map(function (a) { return '<button data-a="' + a.key + '"><span class="swatch" style="background:' + a.color + '"></span>' + esc(a.label) + "</button>"; }).join("");
    seg.querySelectorAll("button").forEach(function (b) { b.onclick = function () { set({ actor: b.dataset.a }); }; });
    $("sectorSelect").innerHTML = '<option value="all">All sectors</option>' + SECTORS.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("");
    $("sectorSelect").onchange = function (e) { set({ sector: e.target.value }); };
    $("countrySelect").onchange = function (e) { set({ loc: e.target.value }); };
    $("resetBtn").onclick = function () { set({ actor: "all", sector: "all", loc: "all", search: "" }); $("searchInput").value = ""; };
    $("searchInput").oninput = function (e) { state.search = e.target.value; state.shown = 15; renderFeed(); };
    $("sortSelect").onchange = function (e) { state.sort = e.target.value; renderFeed(); };
    $("moreBtn").onclick = function () { state.shown += 15; renderFeed(); };
  }
  function syncControls() {
    $("periodSelect").value = state.period;
    var i = MONTH_KEYS.indexOf(state.period);
    $("prevPeriod").disabled = state.period !== "ytd" && i === MONTH_KEYS.length - 1;
    $("nextPeriod").disabled = state.period === "ytd" || i === 0;
    $("actorSeg").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.a === state.actor)); });
    $("sectorSelect").value = state.sector;
    var locs = {}; DATA.forEach(function (d) { if (!d.scored) locs[locKey(d)] = 1; });
    var others = Object.keys(locs).sort();
    $("countrySelect").innerHTML = '<option value="all">All of Central Asia</option><optgroup label="Scored countries">' +
      SCORED.map(function (c) { return "<option>" + c + "</option>"; }).join("") + '</optgroup><optgroup label="Other locations (not scored)">' +
      others.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</optgroup>";
    $("countrySelect").value = state.loc;
    $("resetBtn").hidden = state.actor === "all" && state.sector === "all" && state.loc === "all" && !state.search;
  }
  function set(patch) { Object.assign(state, patch); if (!("selected" in patch)) state.selected = null; state.shown = 15; render(); }

  /* ---------- country cards ---------- */
  function sparkline(country) {
    var ms = chronoMonths(), pts = ms.map(function (m) { return countryScore(country, { period: m }).score; });
    var w = 160, h = 30, step = w / Math.max(1, ms.length - 1), d = "", pen = false, dots = "";
    pts.forEach(function (v, i) {
      if (v == null) { pen = false; return; }
      var x = i * step, y = h - 3 - v / 100 * (h - 6);
      d += (pen ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); pen = true;
      if (ms[i] === state.period) dots = '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="#1B1725"/>';
    });
    return '<svg class="spark" viewBox="-4 0 ' + (w + 8) + " " + h + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" fill="none" stroke="#7A63AC" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' + dots + "</svg>";
  }
  function renderCards() {
    $("countryCards").innerHTML = SCORED.map(function (c) {
      var s = countryScore(c), prev = state.period !== "ytd" ? prevMonth(state.period) : null, delta = "";
      if (prev) {
        var ps = countryScore(c, { period: prev }).score;
        if (s.score != null && ps != null) { var dd = Math.round(s.score - ps); delta = dd === 0 ? "No change vs " + monthLabel(prev, true).split(" ")[0] : (dd > 0 ? "▲ " : "▼ ") + Math.abs(dd) + " vs " + monthLabel(prev, true).split(" ")[0]; }
        else if (s.score != null) delta = "No data for " + monthLabel(prev, true).split(" ")[0];
      }
      return '<button class="card" data-c="' + c + '" aria-pressed="' + (state.loc === c) + '"><span class="cname">' + c + "</span>" +
        '<span class="score' + (s.score == null ? " na" : "") + '">' + (s.score == null ? "No data" : fmt(s.score)) + "</span>" +
        '<span class="meta">' + (s.score == null ? "" : bandChip(s.score)) + "<span>" + plural(s.n, "incident") + "</span></span>" +
        (delta ? '<span class="delta">' + delta + "</span>" : "") + sparkline(c) + "</button>";
    }).join("");
    $("countryCards").querySelectorAll(".card").forEach(function (b) { b.onclick = function () { set({ loc: state.loc === b.dataset.c ? "all" : b.dataset.c }); }; });
  }

  /* ---------- map ---------- */
  var VIEW = { lon0: 46, lon1: 89, lat0: 34.5, lat1: 56 };
  var COSL = Math.cos((VIEW.lat0 + VIEW.lat1) / 2 * Math.PI / 180);
  var K = 1000 / ((VIEW.lon1 - VIEW.lon0) * COSL);
  var MW = 1000, MH = Math.round((VIEW.lat1 - VIEW.lat0) * K);
  function px(lon, lat) { return [(lon - VIEW.lon0) * COSL * K, (VIEW.lat1 - lat) * K]; }
  var COUNTRY_LABELS = { Kazakhstan: [67.5, 48.4], Uzbekistan: [63.2, 42.0], Turkmenistan: [58.6, 39.4], Kyrgyzstan: [74.8, 41.7], Tajikistan: [70.9, 38.7] };
  var CONTEXT_LABELS = [["Russia", 80, 54.6], ["China", 83, 38.2], ["Afghanistan", 66, 35.4], ["Iran", 53.5, 35.4], ["Pakistan", 72, 34.9], ["Caspian Sea", 50.5, 42.6]];
  var ANCHORS = { Azerbaijan: [49.87, 40.41], Caspian: [51.0, 41.6] };
  var PINS = { Russia: [59.5, 55.35, "▲ ", ""], China: [88.6, 44.2, "", " ▶", "end"] };
  PINS[REGION] = [88.6, 55.35, "", "", "end"];
  var placeCache = {};
  function ringContains(ring, x, y) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function featContains(f, lon, lat) {
    return f.geometry.coordinates.some(function (poly) { return ringContains(poly[0], lon, lat) && !poly.slice(1).some(function (h) { return ringContains(h, lon, lat); }); });
  }
  function bbox(f) {
    var b = [180, 90, -180, -90];
    f.geometry.coordinates.forEach(function (p) { p[0].forEach(function (c) { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }); });
    return b;
  }
  function rng(seed) { var s = seed * 2654435761 % 4294967296 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function place(inc) {
    if (placeCache[inc.row]) return placeCache[inc.row];
    var r = rng(inc.row + 7), p = null;
    if (inc.scored && GEO) {
      var f = GEO.byName[inc.location];
      if (f) {
        var b = f._bbox;
        for (var t = 0; t < 400 && !p; t++) {
          var lon = b[0] + r() * (b[2] - b[0]), lat = b[1] + r() * (b[3] - b[1]);
          if (featContains(f, lon, lat)) {
            // keep markers off the country label
            var L = COUNTRY_LABELS[inc.location], q = px(lon, lat), lq = px(L[0], L[1]);
            if (Math.abs(q[0] - lq[0]) < 46 && Math.abs(q[1] - lq[1]) < 12 && t < 300) continue;
            p = [lon, lat];
          }
        }
      }
    } else if (ANCHORS[inc.location]) {
      var a = ANCHORS[inc.location]; p = [a[0] + (r() - .5) * .9, a[1] + (r() - .5) * .7];
    }
    return (placeCache[inc.row] = p);
  }
  function pathOf(f) {
    return f.geometry.coordinates.map(function (poly) {
      return poly.map(function (ring) { return "M" + ring.map(function (c) { var q = px(c[0], c[1]); return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("L") + "Z"; }).join("");
    }).join("");
  }
  function dotColor(inc) { return inc.actors.length === 1 ? ACTOR[inc.actors[0]].color : "#1B1725"; }
  function dotR(inc) { return [3.5, 3.5, 4.5, 6, 7.5][inc.severity == null ? 1 : Math.min(4, Math.max(0, inc.severity))]; }
  function actorChips(inc) { return inc.actors.map(function (a) { return '<span class="chip"><span class="swatch" style="background:' + ACTOR[a].color + '"></span>' + esc(ACTOR[a].label) + "</span>"; }).join(""); }
  function sevTag(inc) { var s = inc.severity; return '<span class="sevtag"><span class="lvl l' + (s == null ? 0 : s) + '">' + (s == null ? "–" : s) + "</span>" + (s == null ? "Unrated" : LEVEL_LABEL[s]) + "</span>"; }

  function renderMap() {
    var el = $("map");
    $("mapSub").textContent = "Severity score by country for " + periodLabel() + (state.actor !== "all" ? ", " + ACTOR[state.actor].label + " incidents only" : "") + (state.sector !== "all" ? ", " + state.sector + " sector" : "") + ". Each marker is one incident, sized by severity.";
    $("mapLegend").innerHTML = '<span class="lg"><span class="ramp">' + BANDS.map(function (b) { return '<i style="background:' + BANDHEX[b.key] + '" title="' + b.label + '"></i>'; }).join("") + "</span>Low → Very high</span>" +
      '<span class="lg"><i style="width:14px;height:10px;display:inline-block;background:' + BANDHEX.b0 + ';border:1px solid #CFCCC4"></i>No incidents</span>' +
      ACTORS.map(function (a) { return '<span class="lg"><span class="swatch" style="background:' + a.color + '"></span>' + esc(a.label) + "</span>"; }).join("") +
      '<span class="lg"><span class="swatch" style="background:#1B1725"></span>Several actors</span>';
    if (!GEO) { el.innerHTML = '<div class="map-fallback">The map could not load. Scores and incidents below are unaffected.</div>'; return; }
    var incs = filter({ loc: "all" }), s = [];
    s.push('<svg viewBox="0 0 ' + MW + " " + MH + '" aria-hidden="true"><defs><clipPath id="mclip"><rect width="' + MW + '" height="' + MH + '"/></clipPath></defs><g clip-path="url(#mclip)">');
    GEO.features.forEach(function (f) {
      var n = f.properties.name, isS = SCORED.indexOf(n) >= 0;
      if (isS) return;
      s.push('<path class="country" d="' + f._d + '" fill="#ECEAE4"/>');
    });
    SCORED.forEach(function (c) {
      var f = GEO.byName[c]; if (!f) return;
      var sc = countryScore(c).score, b = band(sc);
      s.push('<path class="country scored' + (state.loc === c ? " sel" : "") + '" data-c="' + c + '" d="' + f._d + '" fill="' + BANDHEX[b.key] + '"/>');
    });
    CONTEXT_LABELS.forEach(function (l) { var q = px(l[1], l[2]); s.push('<text class="glabel" x="' + q[0].toFixed(0) + '" y="' + q[1].toFixed(0) + '" text-anchor="' + (l[3] || "middle") + '"' + (l[0] === "Caspian Sea" ? ' font-style="italic" style="text-transform:none"' : "") + ">" + l[0] + "</text>"); });
    // dots: low severity first so heavy ones sit on top
    incs.slice().sort(function (a, b) { return (a.severity || 0) - (b.severity || 0); }).forEach(function (inc) {
      var p = place(inc); if (!p) return; var q = px(p[0], p[1]);
      s.push('<circle class="dot' + (state.selected === inc.row ? " sel" : "") + '" data-row="' + inc.row + '" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + dotR(inc) + '" fill="' + dotColor(inc) + '" fill-opacity=".9"/>');
    });
    SCORED.forEach(function (c) {
      var L = COUNTRY_LABELS[c], q = px(L[0], L[1]), b = band(countryScore(c).score);
      s.push('<text class="clabel' + (b.dark ? " dark" : "") + '" x="' + q[0].toFixed(0) + '" y="' + q[1].toFixed(0) + '" text-anchor="middle">' + c + "</text>");
    });
    // pins for incidents located outside the five scored countries
    var counts = {};
    incs.forEach(function (inc) { if (inc.scored || ANCHORS[inc.location]) return; var k = locKey(inc); counts[k] = (counts[k] || 0) + 1; });
    var leftLat = 53.6;
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (k) {
      var pin = PINS[k], txt, anchor;
      if (pin) { txt = pin[2] + k.toUpperCase() + " · " + counts[k] + pin[3]; anchor = pin[4] || "middle"; }
      else { pin = [46.3, leftLat]; leftLat -= 1.25; txt = "◀ " + k.toUpperCase() + " · " + counts[k]; anchor = "start"; }
      var q = px(pin[0], pin[1]), w = txt.length * 6.6 + 16, x = anchor === "end" ? q[0] - w : anchor === "middle" ? q[0] - w / 2 : q[0];
      s.push('<g class="pin' + (state.loc === k ? " sel" : "") + '" data-loc="' + esc(k) + '" role="button"><rect x="' + x.toFixed(0) + '" y="' + (q[1] - 11).toFixed(0) + '" width="' + w.toFixed(0) + '" height="22"/><text x="' + (x + 8).toFixed(0) + '" y="' + (q[1] + 4).toFixed(0) + '">' + esc(txt) + "</text></g>");
    });
    s.push("</g></svg>");
    el.innerHTML = s.join("");
    var byRow = {}; incs.forEach(function (i) { byRow[i.row] = i; });
    el.querySelectorAll(".country.scored").forEach(function (p) {
      var c = p.dataset.c;
      p.onmousemove = function (ev) { var sc = countryScore(c); showTip("<b>" + c + "</b><br>Severity " + fmt(sc.score) + " · " + band(sc.score).label + "<br>" + plural(sc.n, "incident") + " · " + periodLabel(), ev); };
      p.onmouseleave = hideTip;
      p.onclick = function () { set({ loc: state.loc === c ? "all" : c }); };
    });
    el.querySelectorAll(".dot").forEach(function (d) {
      var inc = byRow[d.dataset.row];
      d.onmousemove = function (ev) { showTip("<b>" + esc(inc.title) + "</b><br>" + fmtDate(inc.date) + " · " + esc(inc.location || REGION) + "<br>Severity " + (inc.severity == null ? "unrated" : inc.severity + " · " + LEVEL_LABEL[inc.severity]), ev); };
      d.onmouseleave = hideTip;
      d.onclick = function (ev) { ev.stopPropagation(); hideTip(); set({ selected: inc.row }); };
    });
    el.querySelectorAll(".pin").forEach(function (g) {
      g.onmousemove = function (ev) { showTip("<b>" + esc(g.dataset.loc) + "</b><br>Located outside the five scored countries. Shown as incidents only; not part of any score.", ev); };
      g.onmouseleave = hideTip;
      g.onclick = function () { set({ loc: state.loc === g.dataset.loc ? "all" : g.dataset.loc }); };
    });
  }

  /* ---------- side panel ---------- */
  function actorBars(opts) {
    return '<div class="bars">' + ACTORS.map(function (a) {
      var sc = scopeScore(Object.assign({ actor: a.key }, opts || {}));
      return '<div class="bar-row"><span class="lab"><span class="swatch" style="background:' + a.color + '"></span>' + esc(a.label) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + (sc.score || 0) + "%;background:" + a.color + '"></span></span><span class="val">' + fmt(sc.score) + " <small>(" + sc.n + ")</small></span></div>";
    }).join("") + "</div>";
  }
  function renderPanel() {
    var el = $("sidePanel"), h = [];
    if (state.selected != null) {
      var inc = DATA.filter(function (d) { return d.row === state.selected; })[0];
      if (inc) {
        h.push('<span class="k">INCIDENT · ' + fmtDate(inc.date).toUpperCase() + "</span><h3>" + esc(inc.title) + "</h3>");
        h.push('<div class="chips">' + sevTag(inc) + "</div>");
        h.push('<p class="desc">' + esc(inc.description) + "</p>");
        h.push('<div class="chips"><span class="chip">' + esc(inc.location || REGION) + (inc.scored ? "" : " · not scored") + "</span>" + inc.types.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") + actorChips(inc) + "</div>");
        if (inc.link) h.push('<a href="' + esc(inc.link) + '" target="_blank" rel="noopener">Read the source: ' + esc(domain(inc.link)) + " ↗</a>");
        h.push('<button class="btn-outline" id="panelBack">Back to ' + (state.loc === "all" ? "regional summary" : esc(state.loc)) + "</button>");
        el.innerHTML = h.join(""); $("panelBack").onclick = function () { set({ selected: null }); }; return;
      }
    }
    var loc = state.loc, isScored = loc === "all" || SCORED.indexOf(loc) >= 0;
    var incs = filter();
    h.push('<span class="k">' + (loc === "all" ? "CENTRAL ASIA · REGIONAL AVERAGE" : esc(loc).toUpperCase()) + " · " + periodLabel().toUpperCase() + "</span>");
    if (isScored) {
      var sc = scopeScore();
      h.push('<div class="big"><b>' + fmt(sc.score) + "</b>" + (sc.score == null ? "<span>No rated incidents</span>" : bandChip(sc.score)) + "</div>");
      h.push('<p class="note">' + plural(incs.length, "incident") + (state.actor !== "all" ? " involving " + ACTOR[state.actor].label : "") + (state.sector !== "all" ? " in " + state.sector : "") + (loc === "all" ? ". Regional figure is the average of the five country scores." : ".") + "</p>");
      h.push('<span class="k">SEVERITY BY ACTOR</span>' + actorBars());
    } else {
      h.push("<h3>" + plural(incs.length, "incident") + "</h3><p class=\"note\">" + esc(loc) + " is outside the five scored countries. Its incidents appear on the map and in the feed but don't count toward any score.</p>");
    }
    var top = incs.slice().sort(function (a, b) { return (b.severity || 0) - (a.severity || 0) || (b.date > a.date ? 1 : -1); })[0];
    if (top) {
      h.push('<span class="k">MOST SEVERE THIS PERIOD</span><a href="#" id="topInc" style="text-decoration:none;display:flex;flex-direction:column;gap:6px"><span style="font-family:\'Libre Caslon Text\',serif;font-size:17px;line-height:1.35">' + esc(top.title) + "</span>" + sevTag(top) + "</a>");
    }
    h.push('<button class="btn-outline" id="toFeed">View ' + plural(incs.length, "incident") + " in the feed</button>");
    el.innerHTML = h.join("");
    if (top) $("topInc").onclick = function (e) { e.preventDefault(); set({ selected: top.row }); };
    $("toFeed").onclick = function () { $("feed").scrollIntoView({ behavior: "smooth" }); };
  }

  /* ---------- heatmap: country x actor ---------- */
  function renderHeat() {
    $("heatSub").textContent = periodLabel() + (state.sector !== "all" ? " · " + state.sector + " sector" : " · all sectors") + ". Numbers in brackets are incident counts. Select a cell to filter the page.";
    var cols = [{ key: "all", label: "All actors" }].concat(ACTORS), rows = SCORED.concat(["all"]);
    var h = ['<div style="overflow-x:auto"><table class="heat"><thead><tr><th></th>' + cols.map(function (c) { return "<th><span>" + (c.color ? '<span class="swatch" style="background:' + c.color + '"></span>' : "") + esc(c.label) + "</span></th>"; }).join("") + "</tr></thead><tbody>"];
    rows.forEach(function (r) {
      h.push("<tr><th>" + (r === "all" ? "Regional average" : r) + "</th>");
      cols.forEach(function (c) {
        var sc = scopeScore({ loc: r, actor: c.key }), b = band(sc.score), on = state.loc === r && state.actor === c.key;
        h.push('<td><button class="' + (on ? "on" : "") + '" data-r="' + r + '" data-a="' + c.key + '" style="background:' + BANDHEX[b.key] + ";color:" + (b.dark ? "#fff" : "#1B1725") + (r === "all" ? ";outline:1px solid #CFCCC4;outline-offset:-1px" : "") + '" aria-label="' + (r === "all" ? "Regional average" : r) + ", " + c.label + ": " + (sc.score == null ? "no data" : fmt(sc.score) + ", " + b.label) + ", " + plural(sc.n, "incident") + '"><b>' + fmt(sc.score) + "</b><small>(" + sc.n + ")</small></button></td>");
      });
      h.push("</tr>");
    });
    h.push("</tbody></table></div>");
    $("heatmap").innerHTML = h.join("");
    $("heatmap").querySelectorAll("td button").forEach(function (b) {
      b.onclick = function () { var same = state.loc === b.dataset.r && state.actor === b.dataset.a; set(same ? { loc: "all", actor: "all" } : { loc: b.dataset.r, actor: b.dataset.a }); };
      b.onmousemove = function (ev) { showTip(esc(b.getAttribute("aria-label")), ev); };
      b.onmouseleave = hideTip;
    });
  }

  /* ---------- trend: monthly severity by actor ---------- */
  var tableOpen = { trend: false, sectors: false };
  function renderTrend() {
    var scopeName = state.loc === "all" ? "Central Asia (regional average)" : state.loc;
    var notScored = state.loc !== "all" && SCORED.indexOf(state.loc) < 0;
    $("trendTitle").textContent = "Monthly severity, by actor";
    $("trendSub").textContent = (notScored ? "Select a scored country to see a trend. " : scopeName + (state.sector !== "all" ? " · " + state.sector : "") + ". ") + "Gaps mean no rated incidents that month.";
    if (notScored) { $("trend").innerHTML = ""; return; }
    var ms = chronoMonths(), W = 620, H = 270, m = { l: 34, r: 92, t: 10, b: 28 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    var x = function (i) { return m.l + (ms.length < 2 ? iw / 2 : i * iw / (ms.length - 1)); }, y = function (v) { return m.t + ih - v / 100 * ih; };
    var series = ACTORS.map(function (a) { return { a: a, vals: ms.map(function (mo) { return scopeScore({ period: mo, actor: a.key }).score; }) }; });
    var s = ['<div class="series-legend">' + ACTORS.map(function (a) { return '<span><i style="background:' + a.color + '"></i>' + esc(a.label) + "</span>"; }).join("") + "</div>"];
    s.push('<svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Line chart of monthly severity score by actor for ' + esc(scopeName) + '">');
    var pi = ms.indexOf(state.period);
    if (pi >= 0) { var bw = iw / Math.max(1, ms.length - 1), bx0 = Math.max(m.l, x(pi) - bw / 2), bx1 = Math.min(m.l + iw, x(pi) + bw / 2); s.push('<rect x="' + bx0.toFixed(1) + '" y="' + m.t + '" width="' + (bx1 - bx0).toFixed(1) + '" height="' + ih + '" fill="#F3EEDF"/>'); }
    s.push('<g class="grid">' + [0, 25, 50, 75, 100].map(function (v) { return '<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>'; }).join("") + "</g>");
    s.push('<g class="axis">' + [0, 25, 50, 75, 100].map(function (v) { return '<text x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>"; }).join("") +
      ms.map(function (mo, i) { return '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + MON[+mo.slice(5) - 1] + "</text>"; }).join("") + "</g>");
    var ends = [];
    series.forEach(function (sr) {
      var dim = state.actor !== "all" && state.actor !== sr.a.key, op = dim ? ".18" : "1", d = "", pen = false, last = null;
      sr.vals.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); pen = true; last = [i, v]; });
      s.push('<path d="' + d + '" fill="none" stroke="' + sr.a.color + '" stroke-width="2" stroke-linejoin="round" opacity="' + op + '"/>');
      sr.vals.forEach(function (v, i) { if (v != null) s.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.5" fill="' + sr.a.color + '" stroke="#fff" stroke-width="1.5" opacity="' + op + '"/>'); });
      if (last && !dim) ends.push({ label: sr.a.label, v: last[1], yy: y(last[1]), xx: x(last[0]) });
    });
    ends.sort(function (a, b) { return a.yy - b.yy; });
    for (var i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 13) ends[i].yy = ends[i - 1].yy + 13;
    ends.forEach(function (e) { s.push('<text x="' + (m.l + iw + 10) + '" y="' + (e.yy + 4).toFixed(1) + '" font-size="12" fill="#3E3A46">' + esc(e.label) + " " + fmt(e.v) + "</text>"); });
    s.push('<line id="xhair" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="#1B1725" stroke-width="1" visibility="hidden"/>');
    s.push('<rect id="trendHit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg>');
    s.push('<button class="table-toggle" id="trendTbl">' + (tableOpen.trend ? "Hide" : "Show") + " data table</button>");
    if (tableOpen.trend) s.push('<table class="data"><thead><tr><th>Month</th>' + ACTORS.map(function (a) { return "<th>" + esc(a.label) + "</th>"; }).join("") + "</tr></thead><tbody>" + ms.map(function (mo, i) { return "<tr><td>" + monthLabel(mo) + "</td>" + series.map(function (sr) { return "<td>" + fmt(sr.vals[i]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>");
    $("trend").innerHTML = s.join("");
    $("trendTbl").onclick = function () { tableOpen.trend = !tableOpen.trend; renderTrend(); };
    var svg = $("trend").querySelector("svg"), hit = $("trendHit"), xh = $("xhair");
    hit.onmousemove = function (ev) {
      var r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * W;
      var idx = Math.max(0, Math.min(ms.length - 1, Math.round((sx - m.l) / iw * (ms.length - 1))));
      xh.setAttribute("x1", x(idx)); xh.setAttribute("x2", x(idx)); xh.setAttribute("visibility", "visible");
      showTip("<b>" + monthLabel(ms[idx]) + "</b>" + series.map(function (sr) { return '<div class="tt-row"><span><span class="swatch" style="background:' + sr.a.color + '"></span>' + esc(sr.a.label) + "</span><b>" + fmt(sr.vals[idx]) + "</b></div>"; }).join(""), ev);
    };
    hit.onmouseleave = function () { xh.setAttribute("visibility", "hidden"); hideTip(); };
    hit.onclick = function (ev) { var r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * W; set({ period: ms[Math.max(0, Math.min(ms.length - 1, Math.round((sx - m.l) / iw * (ms.length - 1))))] }); };
  }

  /* ---------- sector bars ---------- */
  function renderSectors() {
    var notScored = state.loc !== "all" && SCORED.indexOf(state.loc) < 0;
    var scopeName = state.loc === "all" ? "Central Asia (regional average)" : state.loc;
    $("sectorSub").textContent = (notScored ? "Select a scored country. " : scopeName + " · " + periodLabel() + (state.actor !== "all" ? " · " + ACTOR[state.actor].label : "") + ". ") + "Each sector carries equal weight in the score.";
    if (notScored) { $("sectors").innerHTML = ""; return; }
    var rows = SECTORS.map(function (sec) {
      var sc = scopeScore({ sector: sec }); return { sec: sec, score: sc.score, n: sc.n };
    });
    var h = ['<div class="bars sector-list">'];
    rows.forEach(function (r) {
      var b = band(r.score), on = state.sector === r.sec;
      h.push('<div class="bar-row" data-s="' + esc(r.sec) + '" style="cursor:pointer;' + (state.sector !== "all" && !on ? "opacity:.45" : "") + '"><span class="lab"' + (on ? ' style="font-weight:500"' : "") + ">" + esc(r.sec) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + (r.score || 0) + "%;background:" + (r.score == null ? "transparent" : BANDHEX[b.key === "b1" ? "b2" : b.key]) + '"></span></span><span class="val">' + fmt(r.score) + " <small>(" + r.n + ")</small></span></div>");
    });
    h.push("</div>");
    h.push('<button class="table-toggle" id="secTbl">' + (tableOpen.sectors ? "Hide" : "Show") + " data table</button>");
    if (tableOpen.sectors) h.push('<table class="data"><thead><tr><th>Sector</th><th>Severity</th><th>Band</th><th>Incidents</th></tr></thead><tbody>' + rows.map(function (r) { return "<tr><td>" + esc(r.sec) + "</td><td>" + fmt(r.score) + "</td><td>" + band(r.score).label + "</td><td>" + r.n + "</td></tr>"; }).join("") + "</tbody></table>");
    $("sectors").innerHTML = h.join("");
    $("secTbl").onclick = function () { tableOpen.sectors = !tableOpen.sectors; renderSectors(); };
    $("sectors").querySelectorAll(".bar-row").forEach(function (r) {
      r.onclick = function () { set({ sector: state.sector === r.dataset.s ? "all" : r.dataset.s }); };
      r.onmousemove = function (ev) { var row = rows.filter(function (x) { return x.sec === r.dataset.s; })[0]; showTip("<b>" + esc(row.sec) + "</b><br>Severity " + fmt(row.score) + " · " + band(row.score).label + "<br>" + plural(row.n, "incident"), ev); };
      r.onmouseleave = hideTip;
    });
  }

  /* ---------- feed ---------- */
  function renderFeed() {
    var q = state.search.trim().toLowerCase();
    var incs = filter().filter(function (i) { return !q || (i.title + " " + i.description).toLowerCase().indexOf(q) >= 0; });
    incs.sort(state.sort === "sev" ? function (a, b) { return (b.severity || 0) - (a.severity || 0) || (b.date > a.date ? 1 : b.date < a.date ? -1 : 0); } : function (a, b) { return b.date > a.date ? 1 : b.date < a.date ? -1 : (b.severity || 0) - (a.severity || 0); });
    var parts = [periodLabel()];
    if (state.actor !== "all") parts.push(ACTOR[state.actor].label);
    if (state.sector !== "all") parts.push(state.sector);
    parts.push(state.loc === "all" ? "all locations" : state.loc);
    $("feedSub").textContent = plural(incs.length, "incident") + " · " + parts.join(" · ");
    $("activeLoc").innerHTML = state.loc !== "all" ? '<span class="chip">Location: ' + esc(state.loc) + ' <button aria-label="Clear location filter" id="clrLoc">×</button></span>' : "";
    if ($("clrLoc")) $("clrLoc").onclick = function () { set({ loc: "all" }); };
    if (!incs.length) { $("feedList").innerHTML = '<li class="empty">No incidents match these filters. Try another month or clear a filter.</li>'; $("moreBtn").hidden = true; return; }
    $("feedList").innerHTML = incs.slice(0, state.shown).map(function (inc) {
      return '<li class="item' + (state.selected === inc.row ? " flash" : "") + '" id="inc-' + inc.row + '"><div class="when">' + fmtDate(inc.date) + sevTag(inc) + "</div><div><h3>" + esc(inc.title) + "</h3><p>" + esc(inc.description) + '</p><div class="row"><span class="chip">' + esc(inc.location || REGION) + (inc.scored ? "" : " · not scored") + "</span>" + inc.types.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") + actorChips(inc) + (inc.link ? '<a class="src" href="' + esc(inc.link) + '" target="_blank" rel="noopener">' + esc(domain(inc.link)) + " ↗</a>" : "") + "</div></div></li>";
    }).join("");
    $("moreBtn").hidden = incs.length <= state.shown;
    $("moreBtn").textContent = "Show more incidents (" + (incs.length - state.shown) + " left)";
  }

  /* ---------- reports + method ---------- */
  function renderReports() {
    var el = $("reportList");
    if (!REPORTS.length) { el.innerHTML = '<div class="report-empty">Analysis from Central Asia Center researchers will be listed here as it is published, each linking to the full report on the New Lines website.</div>'; return; }
    el.innerHTML = '<div class="report-grid">' + REPORTS.map(function (r) {
      return '<a class="report" href="' + esc(r.url) + '"><span class="rm">' + esc([r.date, r.author].filter(Boolean).join(" · ").toUpperCase()) + '</span><span class="rt">' + esc(r.title) + "</span>" + (r.summary ? '<span style="font-size:14.5px;line-height:1.6">' + esc(r.summary) + "</span>" : "") + '<span class="go">READ THE REPORT →</span></a>';
    }).join("") + "</div>";
  }
  function renderMethodExtras(live, generated) {
    $("bandLegend").innerHTML = '<div class="band-list">' + BANDS.map(function (b) { return '<span><i style="background:' + BANDHEX[b.key] + '"></i>' + b.label + " · " + b.range + "</span>"; }).join("") + '<span><i style="background:' + BANDHEX.b0 + ';border:1px solid #CFCCC4"></i>No rated incidents in the period</span></div>';
    var dates = DATA.map(function (d) { return d.date; }).sort();
    $("dataNote").textContent = "Data: " + DATA.length + " incidents, " + (dates.length ? fmtDate(dates[0]) + " to " + fmtDate(dates[dates.length - 1]) : "") + ". " + (live ? "Loaded live from the Central Asia Center's incident sheet." : "Snapshot of the Central Asia Center's incident sheet" + (generated ? ", taken " + fmtDate(generated) : "") + ".") + " Incidents with unverified source links are held back until checked.";
  }

  /* ---------- render ---------- */
  function render() { syncControls(); renderCards(); renderMap(); renderPanel(); renderHeat(); renderTrend(); renderSectors(); renderFeed(); postHeight(); }
  function postHeight() { if (window.parent !== window) try { window.parent.postMessage({ type: "s7cat:height", height: document.documentElement.scrollHeight }, "*"); } catch (e) {} }
  if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);

  Promise.all([
    loadIncidents(),
    loadJSON(CFG.geoUrl).catch(function () { return null; }),
    loadJSON(CFG.reportsUrl).catch(function () { return { reports: [] }; })
  ]).then(function (res) {
    DATA = res[0].incidents;
    var ks = {}; DATA.forEach(function (d) { ks[d.date.slice(0, 7)] = 1; });
    MONTH_KEYS = Object.keys(ks).sort().reverse();
    state.period = MONTH_KEYS[0] || "ytd";
    if (res[1]) {
      GEO = res[1]; GEO.byName = {};
      GEO.features.forEach(function (f) { f._d = pathOf(f); f._bbox = bbox(f); GEO.byName[f.properties.name] = f; });
    }
    REPORTS = (res[2] && res[2].reports) || [];
    buildControls(); renderReports(); renderMethodExtras(!!res[0].live, res[0].generated); render();
  }).catch(function (e) {
    $("countryCards").innerHTML = '<p class="empty">The tracker data could not be loaded. Please refresh the page.</p>';
    if (window.console) console.error(e);
  });
})();
