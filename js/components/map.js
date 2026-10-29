/**
 * Map: one bubble per country showing how many incidents it had, with a
 * ring around it split by sector.
 *
 *   - Bubble size and the number inside = incidents that pass the current
 *     filters (sector, actor, period, search).
 *   - Ring = the same incidents, divided by sector. Each segment's length is
 *     that sector's share of the sector tags. An incident tagged with two
 *     sectors adds to both segments. With a sector filter on, only the
 *     selected sectors appear.
 *   - The five tracked countries are light blue; the selected one is darker.
 *   - Incidents located outside the five countries show as labelled pins
 *     ("RUSSIA · 5"), at the map edge or at a nearby anchor.
 *
 * Reads:  state.country, state.filters
 * Writes: country (click a country or bubble), filters.location (click a pin)
 * DOM:    #map, #mapCaption, #mapLegend
 */
import { byId, esc, plural } from "../util.js";
import { locationKey, REGION_WIDE } from "../data.js";
import { passes, visibleSectors, isFiltered } from "../filters.js";
import * as tooltip from "../tooltip.js";

/* ----------------------------------------------------------- projection */

// Visible window (degrees) and a simple latitude-corrected equirectangular
// projection. Good enough at this regional scale.
const VIEW = { lon0: 46, lon1: 89, lat0: 34.5, lat1: 56 };
const COS = Math.cos(((VIEW.lat0 + VIEW.lat1) / 2) * Math.PI / 180);
const W = 1000;
const K = W / ((VIEW.lon1 - VIEW.lon0) * COS);
const H = Math.round((VIEW.lat1 - VIEW.lat0) * K);

/** [lon, lat] -> [x, y] in SVG units. */
const project = (lon, lat) => [(lon - VIEW.lon0) * COS * K, (VIEW.lat1 - lat) * K];

/* --------------------------------------------------------- placements */

// Bubble centre for each tracked country (lon, lat), chosen so the five
// bubbles and their labels don't collide.
const BUBBLE_AT = {
  Kazakhstan: [67.5, 48.2], Uzbekistan: [63.0, 42.1], Turkmenistan: [58.4, 39.3],
  Kyrgyzstan: [75.0, 41.7], Tajikistan: [70.6, 38.6]
};
// Grey labels for neighbouring countries and the Caspian.
const CONTEXT_LABELS = [
  ["Russia", 80, 54.6], ["China", 83, 38.2], ["Afghanistan", 66, 35.4],
  ["Iran", 53.5, 35.4], ["Pakistan", 72, 34.9], ["Caspian Sea", 51.2, 42.9, true]
];
// Pins for places outside the five countries: [lon, lat, prefix, suffix, anchor].
// Anything not listed stacks down the left edge.
const PINS = {
  Russia: [59.5, 55.35, "▲ ", "", "middle"],
  China: [88.6, 44.2, "", " ▶", "end"],
  Azerbaijan: [48.0, 40.9, "", "", "middle"],
  Caspian: [51.6, 39.4, "", "", "middle"],
  [REGION_WIDE]: [88.6, 55.35, "", "", "end"]
};

// Bubble size: area proportional to count. A bubble with MAX_REF incidents
// gets radius R_MAX; the scale is fixed so sizes stay comparable as filters change.
const R_MIN = 9, R_MAX = 46, MAX_REF = 160;
const RING = 8;  // ring thickness
const GAP = 2;   // gap between ring segments, in SVG units

/* ------------------------------------------------------- SVG helpers */

/** Path for a ring segment between angles a0..a1 (radians, 0 = 12 o'clock). */
function arcPath(cx, cy, r0, r1, a0, a1) {
  const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r1} ${r1} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r0} ${r0} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}

/** SVG path data for a GeoJSON MultiPolygon feature. */
const toPath = (f) => f.geometry.coordinates.map((poly) =>
  poly.map((ring) => "M" + ring.map(([x, y]) => project(x, y).map((n) => n.toFixed(1)).join(" ")).join("L") + "Z").join("")
).join("");

/* ------------------------------------------------------------ component */

export function createMap(ctx) {
  const { cfg, incidents, geo, store } = ctx;
  const el = byId("map");
  const caption = byId("mapCaption");
  const legend = byId("mapLegend");
  const sectorLabel = Object.fromEntries(cfg.sectors.map((s) => [s.key, s.label]));

  // Country outlines are drawn from the same paths every time; compute once.
  const pathOf = {};
  (geo?.features || []).forEach((f) => { pathOf[f.properties.name] = toPath(f); });

  /** Count incidents and sector tags per country (and per outside place) under the filters. */
  function tally(f) {
    const byCountry = Object.fromEntries(cfg.scoredCountries.map((c) => [c, { n: 0, sectors: {} }]));
    const outside = {};
    incidents.forEach((inc) => {
      if (!passes(inc, f)) return;
      if (inc.scored) {
        const t = byCountry[inc.location];
        t.n++;
        visibleSectors(inc, f).forEach((s) => { t.sectors[s] = (t.sectors[s] || 0) + 1; });
      } else {
        const k = PINS[inc.location] ? inc.location : locationKey(inc);
        outside[k] = (outside[k] || 0) + 1;
      }
    });
    return { byCountry, outside };
  }

  /** The legend: one swatch per sector, plus a note on what the bubble means. */
  function renderLegend(f) {
    legend.innerHTML = `<span class="map-legend-title">Ring: incidents by sector</span>` +
      cfg.sectors.map((s) => {
        const off = f.sectors.length && !f.sectors.includes(s.key);
        return `<span class="map-legend-item${off ? " is-off" : ""}"><i style="background:${s.color}"></i>${esc(s.label)}</span>`;
      }).join("");
  }

  /** One country bubble with its ring, number and name. */
  function bubble(c, t, selected) {
    const [cx, cy] = project(...BUBBLE_AT[c]);
    const r = t.n ? R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.min(t.n, MAX_REF) / MAX_REF) : 7;
    const r0 = r + 2, r1 = r + 2 + RING;
    const out = [`<g class="map-bubble${selected ? " is-selected" : ""}" data-country="${c}" tabindex="0" role="button" aria-label="${c}: ${plural(t.n, "incident")}">`];

    // Ring segments, in config order, clockwise from 12 o'clock.
    const total = Object.values(t.sectors).reduce((a, b) => a + b, 0);
    if (total) {
      const segs = cfg.sectors.filter((s) => t.sectors[s.key]);
      const gapA = segs.length > 1 ? GAP / ((r0 + r1) / 2) : 0;
      let a = 0;
      segs.forEach((s) => {
        const span = (t.sectors[s.key] / total) * Math.PI * 2;
        const a0 = a + gapA / 2, a1 = a + span - gapA / 2;
        if (segs.length === 1) out.push(`<circle cx="${cx}" cy="${cy}" r="${(r0 + r1) / 2}" fill="none" stroke="${s.color}" stroke-width="${RING}"/>`);
        else if (a1 > a0) out.push(`<path d="${arcPath(cx, cy, r0, r1, a0, a1)}" fill="${s.color}"/>`);
        a += span;
      });
    } else {
      out.push(`<circle cx="${cx}" cy="${cy}" r="${(r0 + r1) / 2}" fill="none" stroke="#C9C6CE" stroke-width="1" stroke-dasharray="3 3"/>`);
    }

    // Bubble, number, name.
    out.push(`<circle class="map-bubble-core" cx="${cx}" cy="${cy}" r="${r}"/>`);
    out.push(`<text class="map-bubble-n" x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-size="${Math.max(11, Math.min(22, r * 0.62)).toFixed(0)}">${t.n}</text>`);
    out.push(`<text class="map-bubble-name" x="${cx}" y="${(cy + r1 + 15).toFixed(0)}" text-anchor="middle">${c}</text>`);
    out.push(`</g>`);
    return out.join("");
  }

  /** A labelled pin for incidents outside the five countries. */
  function pin(k, n, i, selected) {
    const p = PINS[k] || [46.3, 53.6 - i * 1.25, "◀ ", "", "start"];
    const text = `${p[2]}${k.toUpperCase()} · ${n}${p[3]}`;
    const [px, py] = project(p[0], p[1]);
    const w = text.length * 6.6 + 16;
    const x = p[4] === "end" ? px - w : p[4] === "middle" ? px - w / 2 : px;
    return `<g class="map-pin${selected ? " is-selected" : ""}" data-loc="${esc(k)}" tabindex="0" role="button"><rect x="${x.toFixed(0)}" y="${(py - 11).toFixed(0)}" width="${w.toFixed(0)}" height="22"/><text x="${(x + 8).toFixed(0)}" y="${(py + 4).toFixed(0)}">${esc(text)}</text></g>`;
  }

  function render(state) {
    const f = state.filters;
    const { byCountry, outside } = tally(f);
    const shown = Object.values(byCountry).reduce((a, t) => a + t.n, 0) + Object.values(outside).reduce((a, b) => a + b, 0);
    caption.textContent = `${plural(shown, "incident")}${isFiltered(f) ? " match the feed filters" : " logged so far"}. Select a country to see its profile and indices.`;
    renderLegend(f);

    if (!geo) { el.innerHTML = `<p class="map-fallback">The map could not load. The rest of the tracker is unaffected.</p>`; return; }

    const svg = [`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><clipPath id="mapClip"><rect width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#mapClip)">`];
    // 1. Land: neighbours, then the five tracked countries (selected last, on top).
    geo.features.forEach((ft) => { if (!cfg.scoredCountries.includes(ft.properties.name)) svg.push(`<path class="map-land" d="${pathOf[ft.properties.name]}"/>`); });
    const order = cfg.scoredCountries.filter((c) => c !== state.country).concat(state.country ? [state.country] : []);
    order.forEach((c) => { if (pathOf[c]) svg.push(`<path class="map-country${c === state.country ? " is-selected" : ""}" data-country="${c}" d="${pathOf[c]}"/>`); });
    // 2. Context labels.
    CONTEXT_LABELS.forEach(([name, lon, lat, water]) => {
      const [x, y] = project(lon, lat);
      svg.push(`<text class="map-context${water ? " is-water" : ""}" x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle">${name}</text>`);
    });
    // 3. Bubbles.
    cfg.scoredCountries.forEach((c) => svg.push(bubble(c, byCountry[c], c === state.country)));
    // 4. Pins for outside places.
    let stacked = 0;
    Object.keys(outside).sort((a, b) => outside[b] - outside[a]).forEach((k) => svg.push(pin(k, outside[k], PINS[k] ? 0 : stacked++, f.location === k)));
    svg.push("</g></svg>");
    el.innerHTML = svg.join("");

    wire(byCountry, state);
  }

  /** Hover and click behaviour for countries, bubbles and pins. */
  function wire(byCountry, state) {
    const select = (c) => {
      tooltip.hide();
      const s = store.get();
      // Clicking the selected country again clears the selection.
      store.set({ country: s.country === c ? null : c, filters: { ...s.filters, location: null } });
    };
    const bubbleTip = (c) => {
      const t = byCountry[c];
      const rows = cfg.sectors.filter((s) => t.sectors[s.key]).map((s) =>
        `<div class="tt-row"><span><i class="tt-swatch" style="background:${s.color}"></i>${esc(sectorLabel[s.key])}</span><b>${t.sectors[s.key]}</b></div>`).join("");
      return `<b>${c}</b> · ${plural(t.n, "incident")}${rows ? `<div class="tt-rows">${rows}</div><div class="tt-hint">Incidents tagged with several sectors count in each.</div>` : ""}`;
    };
    el.querySelectorAll(".map-country, .map-bubble").forEach((node) => {
      const c = node.dataset.country;
      tooltip.bind(node, () => bubbleTip(c));
      node.addEventListener("click", () => select(c));
      node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(c); } });
    });
    el.querySelectorAll(".map-pin").forEach((g) => {
      const loc = g.dataset.loc;
      const toggle = () => { tooltip.hide(); const f = store.get().filters; store.set({ filters: { ...f, location: f.location === loc ? null : loc } }); };
      tooltip.bind(g, () => `<b>${esc(loc)}</b><br>Outside the five tracked countries. Shown in the feed, not counted in any index.`);
      g.addEventListener("click", toggle);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter") toggle(); });
    });
  }

  return { render };
}
