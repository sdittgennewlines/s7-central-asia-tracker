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
 *   - An incident listing several countries adds to each of their bubbles,
 *     so the five numbers can add up to more than the number of incidents.
 *   - The five tracked countries are light blue; the selected one is darker.
 *
 * Reads:  state.country, state.filters
 * Writes: country (click a country or bubble)
 * DOM:    #map
 */
import { byId, esc, plural } from "../util.js";
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
// Bubble size: area proportional to count, on a fixed scale so sizes stay
// comparable as filters change. R is the OUTER radius (core + ring).
const R_MIN = 16, R_MAX = 58, MAX_REF = 160;
const CORE = 0.64; // core radius as a share of the outer radius; the rest is the ring

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
  const sectorLabel = Object.fromEntries(cfg.sectors.map((s) => [s.key, s.label]));

  // Country outlines are drawn from the same paths every time; compute once.
  const pathOf = {};
  (geo?.features || []).forEach((f) => { pathOf[f.properties.name] = toPath(f); });

  /**
   * Count incidents and sector tags per country under the filters.
   * Returns { byCountry, total } where total counts each incident once.
   */
  function tally(f) {
    const byCountry = Object.fromEntries(cfg.scoredCountries.map((c) => [c, { n: 0, sectors: {} }]));
    let total = 0;
    incidents.forEach((inc) => {
      if (!passes(inc, f)) return;
      total++;
      inc.locations.forEach((c) => {
        const t = byCountry[c];
        if (!t) return;
        t.n++;
        visibleSectors(inc, f).forEach((s) => { t.sectors[s] = (t.sectors[s] || 0) + 1; });
      });
    });
    return { byCountry, total };
  }

  /**
   * One country: a transparent core with the incident count, wrapped in a thick
   * ring whose segments are the sector shares (clockwise from 12 o'clock,
   * in config order). The country name sits underneath.
   */
  function bubble(c, t, selected) {
    const [cx, cy] = project(...BUBBLE_AT[c]);
    const R = t.n ? R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.min(t.n, MAX_REF) / MAX_REF) : R_MIN * 0.75;
    const r = R * CORE;
    const out = [`<g class="map-bubble${selected ? " is-selected" : ""}" data-country="${c}" tabindex="0" role="button" aria-label="${c}: ${plural(t.n, "incident")}">`];

    // Ring: a neutral track, then one solid segment per sector.
    out.push(`<circle class="map-ring-track" cx="${cx}" cy="${cy}" r="${(R + r) / 2}" stroke-width="${R - r}"/>`);
    const total = Object.values(t.sectors).reduce((a, b) => a + b, 0);
    let a = 0;
    cfg.sectors.filter((sec) => t.sectors[sec.key]).forEach((sec, i, segs) => {
      const span = (t.sectors[sec.key] / total) * Math.PI * 2;
      out.push(segs.length === 1
        ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${sec.color}" stroke-width="${R - r}"/>`
        : `<path d="${arcPath(cx, cy, r, R, a, a + span)}" fill="${sec.color}"/>`);
      a += span;
    });

    // Core, number, outline when selected, name.
    out.push(`<circle class="map-bubble-core" cx="${cx}" cy="${cy}" r="${r.toFixed(1)}"/>`);
    out.push(`<text class="map-bubble-n" x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-size="${Math.max(12, r * 0.95).toFixed(0)}">${t.n}</text>`);
    if (selected) out.push(`<circle class="map-bubble-sel" cx="${cx}" cy="${cy}" r="${(R + 3).toFixed(1)}"/>`);
    out.push(`<text class="map-bubble-name" x="${cx}" y="${(cy + R + 15).toFixed(0)}" text-anchor="middle">${c}</text>`);
    out.push(`</g>`);
    return out.join("");
  }

  function render(state) {
    const f = state.filters;
    const { byCountry, total } = tally(f);

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
    // 4. A one-line key in the corner (the sector colours are keyed by the feed's checkboxes).
    svg.push(`<text class="map-key" x="14" y="${H - 14}">${plural(total, "incident")}${isFiltered(f) ? " match the filters" : ""} · number = incidents in each country (multi-country incidents count in each) · ring = share by sector</text>`);
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
      store.set({ country: s.country === c ? null : c });
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
  }

  return { render };
}
