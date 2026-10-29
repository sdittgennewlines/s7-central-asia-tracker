/**
 * Map: the five scored countries in light blue, the selected one
 * highlighted, and one marker per incident in the selected month.
 *
 * Markers are coloured and sized by incident severity. Because the sheet
 * only records a country (not a city), each marker is placed at a stable
 * pseudo-random point inside its country. Incidents located outside the
 * five countries show as labelled pins at the map edge (e.g. "RUSSIA · 3").
 *
 * Reads:  state.country, state.month, state.highlight, state.feed.location
 * Writes: country (click a country), highlight (click a marker),
 *         feed.location (click an edge pin)
 * DOM:    #map, #mapCaption, #mapLegend
 */
import { byId, esc, fmtDate, monthLabel, plural } from "../util.js";
import { locationKey, REGION_WIDE } from "../data.js";
import { severityColor } from "../scales.js";
import * as tooltip from "../tooltip.js";

/* ----------------------------------------------------------- projection */

// Visible window (degrees) and a simple equirectangular projection,
// corrected for latitude. Good enough at this regional scale.
const VIEW = { lon0: 46, lon1: 89, lat0: 34.5, lat1: 56 };
const COS = Math.cos(((VIEW.lat0 + VIEW.lat1) / 2) * Math.PI / 180);
const W = 1000;
const K = W / ((VIEW.lon1 - VIEW.lon0) * COS);
const H = Math.round((VIEW.lat1 - VIEW.lat0) * K);

/** [lon, lat] -> [x, y] in SVG units. */
const project = (lon, lat) => [(lon - VIEW.lon0) * COS * K, (VIEW.lat1 - lat) * K];

/* --------------------------------------------------------- placements */

// Where to write each country's name (lon, lat).
const COUNTRY_LABELS = {
  Kazakhstan: [67.5, 48.4], Uzbekistan: [63.2, 42.0], Turkmenistan: [58.6, 39.4],
  Kyrgyzstan: [74.8, 41.7], Tajikistan: [70.9, 38.7]
};
// Grey context labels for neighbours.
const CONTEXT_LABELS = [
  ["Russia", 80, 54.6], ["China", 83, 38.2], ["Afghanistan", 66, 35.4],
  ["Iran", 53.5, 35.4], ["Pakistan", 72, 34.9], ["Caspian Sea", 50.5, 42.6, true]
];
// Non-scored locations that fit inside the window get real-ish positions.
const ANCHORS = { Azerbaijan: [49.87, 40.41], Caspian: [51.0, 41.6] };
// Edge pins: [lon, lat, prefix, suffix, text-anchor]. Others stack on the left edge.
const PINS = {
  Russia: [59.5, 55.35, "▲ ", "", "middle"],
  China: [88.6, 44.2, "", " ▶", "end"],
  [REGION_WIDE]: [88.6, 55.35, "", "", "end"]
};

/* ------------------------------------------------------ geometry utils */

/** Ray-casting point-in-ring test. */
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Point-in-MultiPolygon, respecting holes. */
const inFeature = (f, lon, lat) =>
  f.geometry.coordinates.some((poly) => inRing(poly[0], lon, lat) && !poly.slice(1).some((h) => inRing(h, lon, lat)));

/** Bounding box [minLon, minLat, maxLon, maxLat]. */
function bbox(f) {
  const b = [180, 90, -180, -90];
  f.geometry.coordinates.forEach((p) => p[0].forEach(([x, y]) => {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }));
  return b;
}

/** SVG path data for a feature. */
const toPath = (f) => f.geometry.coordinates.map((poly) =>
  poly.map((ring) => "M" + ring.map(([x, y]) => project(x, y).map((n) => n.toFixed(1)).join(" ")).join("L") + "Z").join("")
).join("");

/** Small seeded PRNG so each incident always lands in the same spot. */
function seeded(seed) {
  let s = (seed * 2654435761) % 4294967296 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ------------------------------------------------------------ component */

export function createMap(ctx) {
  const { cfg, incidents, geo, store } = ctx;
  const el = byId("map");
  const caption = byId("mapCaption");
  const legend = byId("mapLegend");

  // Pre-compute country paths and bounding boxes once.
  const byName = {};
  (geo?.features || []).forEach((f) => { f._d = toPath(f); f._bbox = bbox(f); byName[f.properties.name] = f; });

  // Legend is static.
  legend.innerHTML = `<span class="map-legend-title">Incident severity</span>` +
    [1, 2, 3, 4].map((lvl) => `<span class="map-legend-item"><svg width="${8 + lvl * 3}" height="${8 + lvl * 3}" aria-hidden="true"><circle cx="50%" cy="50%" r="${dotRadius(lvl) - 0.5}" fill="${severityColor(cfg, lvl)}" stroke="#1B1725" stroke-width=".8"/></svg>${lvl} · ${esc(cfg.severityLevels[lvl].label)}</span>`).join("");

  /** Marker radius by severity (unrated draws as level 1). */
  function dotRadius(sev) { return [4, 4, 5.5, 7, 9][sev == null ? 1 : Math.min(4, Math.max(0, sev))]; }

  /** Stable position [lon, lat] for an incident, or null if it can't be placed. */
  const placeCache = new Map();
  function place(inc) {
    if (placeCache.has(inc.row)) return placeCache.get(inc.row);
    const rnd = seeded(inc.row + 7);
    let p = null;
    const f = inc.scored && byName[inc.location];
    if (f) {
      const [x0, y0, x1, y1] = f._bbox;
      const [lx, ly] = project(...COUNTRY_LABELS[inc.location]);
      for (let t = 0; t < 400 && !p; t++) {
        const lon = x0 + rnd() * (x1 - x0), lat = y0 + rnd() * (y1 - y0);
        if (!inFeature(f, lon, lat)) continue;
        const [x, y] = project(lon, lat);
        if (t < 300 && Math.abs(x - lx) < 48 && Math.abs(y - ly) < 13) continue; // keep the label readable
        p = [lon, lat];
      }
    } else if (ANCHORS[inc.location]) {
      const [lon, lat] = ANCHORS[inc.location];
      p = [lon + (rnd() - 0.5) * 0.9, lat + (rnd() - 0.5) * 0.7];
    }
    placeCache.set(inc.row, p);
    return p;
  }

  function render(state) {
    const monthIncs = incidents.filter((i) => i.date.startsWith(state.month));
    caption.textContent = `${plural(monthIncs.length, "incident")} in ${monthLabel(state.month)}. Select a country to see its profile and indices.`;

    if (!geo) { el.innerHTML = `<p class="map-fallback">The map could not load. The rest of the tracker is unaffected.</p>`; return; }

    const svg = [`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><clipPath id="mapClip"><rect width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#mapClip)">`];

    // 1. Neighbouring countries (neutral land).
    geo.features.forEach((f) => { if (!cfg.scoredCountries.includes(f.properties.name)) svg.push(`<path class="map-land" d="${f._d}"/>`); });
    // 2. The five scored countries; the selected one last so its outline sits on top.
    const order = cfg.scoredCountries.filter((c) => c !== state.country).concat(state.country);
    order.forEach((c) => { if (byName[c]) svg.push(`<path class="map-country${c === state.country ? " is-selected" : ""}" data-country="${c}" d="${byName[c]._d}"/>`); });
    // 3. Context labels.
    CONTEXT_LABELS.forEach(([name, lon, lat, water]) => {
      const [x, y] = project(lon, lat);
      svg.push(`<text class="map-context${water ? " is-water" : ""}" x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle">${name}</text>`);
    });
    // 4. Incident markers, low severity first so severe ones sit on top.
    [...monthIncs].sort((a, b) => (a.severity || 0) - (b.severity || 0)).forEach((inc) => {
      const p = place(inc);
      if (!p) return;
      const [x, y] = project(...p);
      svg.push(`<circle class="map-dot${state.highlight === inc.row ? " is-selected" : ""}" data-row="${inc.row}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius(inc.severity)}" fill="${severityColor(cfg, inc.severity)}"/>`);
    });
    // 5. Country names.
    cfg.scoredCountries.forEach((c) => {
      const [x, y] = project(...COUNTRY_LABELS[c]);
      svg.push(`<text class="map-label${c === state.country ? " is-selected" : ""}" x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle">${c}</text>`);
    });
    // 6. Edge pins for incidents outside the map's countries.
    const counts = {};
    monthIncs.forEach((inc) => { if (!inc.scored && !ANCHORS[inc.location]) { const k = locationKey(inc); counts[k] = (counts[k] || 0) + 1; } });
    let leftLat = 53.6;
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach((k) => {
      let pin = PINS[k];
      if (!pin) { pin = [46.3, leftLat, "◀ ", "", "start"]; leftLat -= 1.25; }
      const text = `${pin[2]}${k.toUpperCase()} · ${counts[k]}${pin[3]}`;
      const [px, py] = project(pin[0], pin[1]);
      const w = text.length * 6.6 + 16;
      const x = pin[4] === "end" ? px - w : pin[4] === "middle" ? px - w / 2 : px;
      svg.push(`<g class="map-pin${state.feed.location === k ? " is-selected" : ""}" data-loc="${esc(k)}"><rect x="${x.toFixed(0)}" y="${(py - 11).toFixed(0)}" width="${w.toFixed(0)}" height="22"/><text x="${(x + 8).toFixed(0)}" y="${(py + 4).toFixed(0)}">${esc(text)}</text></g>`);
    });
    svg.push("</g></svg>");
    el.innerHTML = svg.join("");

    wire(monthIncs);
  }

  /** Attach hover and click behaviour to the freshly drawn SVG. */
  function wire(monthIncs) {
    const byRow = new Map(monthIncs.map((i) => [String(i.row), i]));

    el.querySelectorAll(".map-country").forEach((p) => {
      const c = p.dataset.country;
      tooltip.bind(p, () => `<b>${c}</b><br>Select to view profile and indices`);
      p.addEventListener("click", () => { tooltip.hide(); store.set({ country: c, highlight: null, feed: { ...store.get().feed, location: null } }); });
    });

    el.querySelectorAll(".map-dot").forEach((d) => {
      const inc = byRow.get(d.dataset.row);
      tooltip.bind(d, () => `<b>${esc(inc.title)}</b><br>${fmtDate(inc.date)} · ${esc(inc.location || REGION_WIDE)}<br>Severity ${inc.severity ?? "unrated"}${inc.severity ? ` · ${esc(cfg.severityLevels[Math.max(1, inc.severity)].label)}` : ""}`);
      d.addEventListener("click", () => {
        tooltip.hide();
        // Selecting an incident also selects its country, so the feed beside the map can show it.
        const s = store.get();
        const patch = { highlight: inc.row, feed: { ...s.feed, allMonths: false, actor: "all", sector: "all", search: "", location: inc.scored ? null : locationKey(inc) } };
        if (inc.scored) patch.country = inc.location;
        store.set(patch);
      });
    });

    el.querySelectorAll(".map-pin").forEach((g) => {
      const loc = g.dataset.loc;
      tooltip.bind(g, () => `<b>${esc(loc)}</b><br>Outside the five tracked countries. Shown in the feed, not counted in any index.`);
      g.addEventListener("click", () => { tooltip.hide(); store.setFeed({ location: store.get().feed.location === loc ? null : loc }); });
    });
  }

  return { render };
}
