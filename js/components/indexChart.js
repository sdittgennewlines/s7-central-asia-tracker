/**
 * Index chart: monthly RII / CII / USEI / SIRI for the selected country,
 * as overlaid lines. Users choose which indices to show and the time span.
 * Clicking a month selects it for the whole page.
 *
 * Reads:  state.country, state.month, state.range, state.indices
 * Writes: indices (toggle chips), range (time-span buttons), month (click)
 * DOM:    #indexChart (chart), #indexToggles, #rangeSeg, #indexChartTitle
 */
import { byId, esc, fmtIndex, monthAbbr, monthLabel } from "../util.js";
import * as tooltip from "../tooltip.js";

// Chart geometry in SVG units (scaled to the container width by CSS).
const W = 460, H = 250;
const M = { top: 12, right: 58, bottom: 26, left: 30 };
const IW = W - M.left - M.right, IH = H - M.top - M.bottom;

const RANGES = [
  { key: "3", label: "3 months" },
  { key: "6", label: "6 months" },
  { key: "all", label: "Year to date" }
];

export function createIndexChart(ctx) {
  const { cfg, months, scorer, store } = ctx;
  const el = byId("indexChart");
  const toggles = byId("indexToggles");
  const rangeSeg = byId("rangeSeg");
  const title = byId("indexChartTitle");
  let tableOpen = false;

  /* ---- controls (built once) ---- */
  toggles.innerHTML = cfg.indices.map((ix) =>
    `<button class="ic-toggle" data-key="${ix.key}" title="${esc(ix.name)}"><span class="swatch" style="background:${ix.color}"></span>${ix.key}</button>`
  ).join("");
  toggles.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const on = new Set(store.get().indices);
    on.has(b.dataset.key) ? on.delete(b.dataset.key) : on.add(b.dataset.key);
    if (on.size === 0) return; // keep at least one index visible
    store.set({ indices: cfg.indices.map((ix) => ix.key).filter((k) => on.has(k)) });
  }));

  rangeSeg.innerHTML = RANGES.map((r) => `<button data-range="${r.key}">${r.label}</button>`).join("");
  rangeSeg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => store.set({ range: b.dataset.range })));

  /** Months shown for a range key, ending at the latest month with data. */
  function visibleMonths(range) {
    return range === "all" ? months : months.slice(-Number(range));
  }

  function render(state) {
    title.textContent = `Influence indices: ${state.country}`;
    toggles.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(state.indices.includes(b.dataset.key))));
    rangeSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === state.range)));

    const ms = visibleMonths(state.range);
    const shown = cfg.indices.filter((ix) => state.indices.includes(ix.key));
    const series = shown.map((ix) => ({ ix, points: scorer.series(state.country, ix.key, ms) }));

    // Y axis: always starts at 0; top is the next multiple of 25 above the data (max 100).
    const peak = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value)));
    const yMax = peak <= 25 ? 25 : peak <= 50 ? 50 : Math.min(100, Math.ceil(peak / 25) * 25);
    const x = (i) => M.left + (ms.length < 2 ? IW / 2 : (i * IW) / (ms.length - 1));
    const y = (v) => M.top + IH - (v / yMax) * IH;
    const step = ms.length < 2 ? IW : IW / (ms.length - 1);

    const s = [`<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of monthly influence indices for ${esc(state.country)}">`];

    // Selected-month band.
    const sel = ms.indexOf(state.month);
    if (sel >= 0) {
      const x0 = Math.max(M.left, x(sel) - step / 2), x1 = Math.min(M.left + IW, x(sel) + step / 2);
      s.push(`<rect x="${x0.toFixed(1)}" y="${M.top}" width="${(x1 - x0).toFixed(1)}" height="${IH}" class="ic-band"/>`);
    }
    // Grid and axes.
    // Round tick steps: 5 for a 0-25 axis, 10 up to 50, 25 above.
    const tickStep = yMax <= 25 ? 5 : yMax <= 50 ? 10 : 25;
    const ticks = Array.from({ length: yMax / tickStep + 1 }, (_, i) => i * tickStep);
    s.push(`<g class="grid">${ticks.map((t) => `<line x1="${M.left}" x2="${M.left + IW}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>`);
    s.push(`<g class="axis">${ticks.map((t) => `<text x="${M.left - 7}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("")}${ms.map((m, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${monthAbbr(m)}</text>`).join("")}</g>`);

    // Lines + markers.
    series.forEach(({ ix, points }) => {
      const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join("");
      s.push(`<path d="${d}" fill="none" stroke="${ix.color}" stroke-width="2" stroke-linejoin="round"/>`);
      points.forEach((p, i) => s.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="${ix.color}" stroke="#fff" stroke-width="1.5"/>`));
    });

    // Direct labels at the line ends, nudged apart so they don't overlap.
    const ends = series.map(({ ix, points }) => ({ ix, v: points[points.length - 1].value, yy: y(points[points.length - 1].value) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 13) ends[i].yy = ends[i - 1].yy + 13;
    ends.forEach((e) => s.push(`<text x="${M.left + IW + 8}" y="${(e.yy + 4).toFixed(1)}" class="ic-endlabel">${e.ix.key} ${fmtIndex(e.v)}</text>`));

    // Crosshair + invisible hit area.
    s.push(`<line class="ic-crosshair" y1="${M.top}" y2="${M.top + IH}" visibility="hidden"/>`);
    s.push(`<rect class="ic-hit" x="${M.left - step / 2}" y="${M.top}" width="${IW + step}" height="${IH}" fill="transparent"/>`);
    s.push("</svg>");

    // Accessible data table.
    s.push(`<button class="table-toggle">${tableOpen ? "Hide" : "Show"} data table</button>`);
    if (tableOpen) {
      s.push(`<table class="data-table"><thead><tr><th>Month</th>${shown.map((ix) => `<th>${ix.key}</th>`).join("")}</tr></thead><tbody>${ms.map((m, i) => `<tr><td>${monthLabel(m)}</td>${series.map((sr) => `<td>${fmtIndex(sr.points[i].value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    }
    el.innerHTML = s.join("");

    el.querySelector(".table-toggle").addEventListener("click", () => { tableOpen = !tableOpen; render(store.get()); });
    wireHover(ms, series, x, step);
  }

  /** Crosshair tooltip on hover; click selects the month under the pointer. */
  function wireHover(ms, series, x, step) {
    const svg = el.querySelector("svg"), hit = el.querySelector(".ic-hit"), cross = el.querySelector(".ic-crosshair");
    const indexAt = (ev) => {
      const r = svg.getBoundingClientRect();
      const sx = ((ev.clientX - r.left) / r.width) * W;
      return Math.max(0, Math.min(ms.length - 1, Math.round((sx - M.left) / step)));
    };
    hit.addEventListener("mousemove", (ev) => {
      const i = indexAt(ev);
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      tooltip.show(`<b>${monthLabel(ms[i])}</b>` + series.map(({ ix, points }) =>
        `<div class="tt-row"><span><span class="swatch" style="background:${ix.color}"></span>${ix.key}</span><b>${fmtIndex(points[i].value)}</b></div>`).join("") +
        `<div class="tt-hint">Click to see the breakdown</div>`, ev);
    });
    hit.addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); tooltip.hide(); });
    hit.addEventListener("click", (ev) => { tooltip.hide(); store.set({ month: ms[indexAt(ev)], highlight: null }); });
  }

  return { render };
}
