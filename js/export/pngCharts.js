/**
 * pngCharts.js: the downloadable image (PNG) versions of the index charts.
 *
 * The on-page charts use web fonts and CSS, which a browser can't turn into
 * an image directly. So each chart is redrawn here as a plain, self-contained
 * SVG from the same numbers, in the same frame as the GFP platform's images:
 *
 *   Title                                         (Georgia, bold)
 *   Subtitle
 *   ───────────────────────────────────────────
 *   the chart
 *   ───────────────────────────────────────────
 *   © 2026 The New Lines Institute        Central Asia Center · S7+ …
 *
 * Builders (each returns { svg, width, height } for download.js):
 *   lineImage         monthly index lines (the line chart)
 *   breakdownImage    sector × index table with bars (how a country's indices add up)
 *   countryTableImage the four indices for the five countries, shaded
 *
 * Fonts are ones every computer has (Georgia, Helvetica/Arial), because a
 * downloaded image can't load web fonts.
 */
import { CONFIG } from "../../config.js";
import { xml } from "../download.js";
import { fmtIndex } from "../util.js";
import { indexStep } from "../scales.js";

const M = 32;    // outer margin
const HEAD = 84; // title + subtitle strip
const FOOT = 52; // footer strip
const SANS = "Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Wrap a chart body in the standard frame. */
function frame({ title, subtitle, width, bodyHeight, body }) {
  const height = HEAD + bodyHeight + FOOT;
  const footY = HEAD + bodyHeight + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}">
    <rect width="100%" height="100%" fill="#FFFFFF"/>
    <text x="${M}" y="${M + 10}" font-family="${SERIF}" font-size="22" font-weight="700" fill="#1B1725">${xml(title)}</text>
    <text x="${M}" y="${M + 34}" font-size="13" fill="#3E3A46">${xml(subtitle)}</text>
    <line x1="${M}" y1="${HEAD - 8}" x2="${width - M}" y2="${HEAD - 8}" stroke="#1B1725"/>
    <g transform="translate(0,${HEAD})">${body}</g>
    <line x1="${M}" y1="${footY}" x2="${width - M}" y2="${footY}" stroke="#DCDAD3"/>
    <text x="${M}" y="${footY + 20}" font-size="12" fill="#3E3A46">${xml(CONFIG.copyright)}</text>
    <text x="${width - M}" y="${footY + 20}" font-size="12" fill="#5E5A66" text-anchor="end">${xml(CONFIG.credit)}</text>
  </svg>`;
  return { svg, width, height };
}

/**
 * Line chart.
 *   months: ["Jan", ...] axis labels
 *   series: [{ label: "RII", color, values: [number, ...] }]
 */
export function lineImage({ title, subtitle, months, series, width = 860 }) {
  const legendH = 28, plotH = 300, axisH = 28;
  const left = M + 30, right = width - M - 70;
  const peak = Math.max(0, ...series.flatMap((s) => s.values));
  const yMax = peak <= 25 ? 25 : peak <= 50 ? 50 : Math.min(100, Math.ceil(peak / 25) * 25);
  const step = yMax <= 25 ? 5 : yMax <= 50 ? 10 : 25;
  const x = (i) => left + (months.length < 2 ? (right - left) / 2 : (i * (right - left)) / (months.length - 1));
  const y = (v) => legendH + plotH - (v / yMax) * plotH;

  const parts = [];
  // Legend.
  let lx = M;
  series.forEach((s) => {
    parts.push(`<rect x="${lx}" y="6" width="16" height="3" fill="${s.color}"/><text x="${lx + 22}" y="12" font-size="12" fill="#3E3A46">${xml(s.name || s.label)}</text>`);
    lx += 34 + (s.name || s.label).length * 6.6;
  });
  // Grid + axes.
  for (let t = 0; t <= yMax; t += step) {
    parts.push(`<line x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}" stroke="#ECEAE4"/><text x="${left - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#5E5A66">${t}</text>`);
  }
  months.forEach((m, i) => parts.push(`<text x="${x(i)}" y="${legendH + plotH + 20}" text-anchor="middle" font-size="11" fill="#5E5A66">${xml(m)}</text>`));
  // Lines, points, end labels (nudged apart).
  const ends = [];
  series.forEach((s) => {
    parts.push(`<path d="${s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("")}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`);
    s.values.forEach((v, i) => parts.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${s.color}" stroke="#FFFFFF" stroke-width="1.5"/>`));
    const last = s.values[s.values.length - 1];
    ends.push({ label: `${s.label} ${fmtIndex(last)}`, yy: y(last) });
  });
  ends.sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 14) ends[i].yy = ends[i - 1].yy + 14;
  ends.forEach((e) => parts.push(`<text x="${right + 8}" y="${(e.yy + 4).toFixed(1)}" font-size="12" font-weight="700" fill="#3E3A46">${xml(e.label)}</text>`));

  return frame({ title, subtitle, width, bodyHeight: legendH + plotH + axisH, body: parts.join("") });
}

/**
 * Sector breakdown: one row per sector, one column per index. Each cell is a
 * bar out of `max` points in the sector's colour, with its value.
 *   sectors: [{ label, color }]
 *   indices: [{ key, name }]
 *   cells:   cells[sectorIndex][indexIndex] = points
 *   totals:  [index value, ...]
 */
export function breakdownImage({ title, subtitle, sectors, indices, cells, totals, max, totalLabel = "Index score" }) {
  const labelW = 200, colW = 150, rowH = 30;
  const width = M * 2 + labelW + indices.length * colW;
  const cx = (j) => M + labelW + j * colW;
  const parts = [];
  // Header.
  parts.push(`<text x="${M}" y="14" font-size="11" font-weight="700" letter-spacing="0.6" fill="#3E3A46">SECTOR (UP TO ${max} POINTS)</text>`);
  indices.forEach((ix, j) => parts.push(`<text x="${cx(j)}" y="14" font-size="11" font-weight="700" letter-spacing="0.6" fill="#3E3A46">${xml(ix.key)}</text><text x="${cx(j) + ix.key.length * 8 + 6}" y="14" font-size="10.5" fill="#5E5A66">${xml(ix.short || "")}</text>`));
  parts.push(`<line x1="${M}" y1="24" x2="${width - M}" y2="24" stroke="#DCDAD3"/>`);
  // Rows.
  sectors.forEach((s, i) => {
    const y = 28 + i * rowH;
    parts.push(`<rect x="${M}" y="${y + 10}" width="10" height="10" rx="2" fill="${s.color}"/><text x="${M + 18}" y="${y + 19}" font-size="13" fill="#1B1725">${xml(s.label)}</text>`);
    indices.forEach((ix, j) => {
      const v = cells[i][j], barW = colW - 54;
      parts.push(`<rect x="${cx(j)}" y="${y + 10}" width="${barW}" height="10" fill="#ECEAE4"/>`);
      if (v > 0) parts.push(`<rect x="${cx(j)}" y="${y + 10}" width="${((v / max) * barW).toFixed(1)}" height="10" fill="${s.color}"/>`);
      parts.push(`<text x="${cx(j) + colW - 14}" y="${y + 19}" text-anchor="end" font-size="12.5" ${v > 0 ? 'font-weight="700" fill="#1B1725"' : 'fill="#A9A6AE"'}>${fmtIndex(v)}</text>`);
    });
    parts.push(`<line x1="${M}" y1="${y + rowH}" x2="${width - M}" y2="${y + rowH}" stroke="#ECEAE4"/>`);
  });
  // Totals.
  const ty = 28 + sectors.length * rowH;
  parts.push(`<line x1="${M}" y1="${ty}" x2="${width - M}" y2="${ty}" stroke="#1B1725"/><text x="${M}" y="${ty + 22}" font-size="13" font-weight="700" fill="#1B1725">${xml(totalLabel)}</text>`);
  totals.forEach((v, j) => parts.push(`<text x="${cx(j) + colW - 14}" y="${ty + 22}" text-anchor="end" font-size="15" font-weight="700" fill="#1B1725">${fmtIndex(v)}<tspan font-size="11" font-weight="400" fill="#5E5A66"> / 100</tspan></text>`));

  return frame({ title, subtitle, width, bodyHeight: ty + 34, body: parts.join("") });
}

/**
 * Country × index grid, shaded with the page's light-blue steps.
 *   countries: ["Kazakhstan", ...]
 *   indices:   [{ key, name }]
 *   values:    values[countryIndex][indexIndex] = { value, incidents }
 */
export function countryTableImage({ title, subtitle, countries, indices, values }) {
  const labelW = 150, colW = 170, rowH = 46, headH = 44;
  const width = M * 2 + labelW + indices.length * colW;
  const cx = (j) => M + labelW + j * colW;
  const parts = [];
  indices.forEach((ix, j) => parts.push(`<text x="${cx(j) + 6}" y="16" font-size="13" font-weight="700" fill="#1B1725">${xml(ix.key)}</text><text x="${cx(j) + 6}" y="32" font-size="10.5" fill="#5E5A66">${xml(ix.name)}</text>`));
  countries.forEach((c, i) => {
    const y = headH + i * (rowH + 3);
    parts.push(`<text x="${M}" y="${y + rowH / 2 + 5}" font-size="14" fill="#1B1725">${xml(c)}</text>`);
    indices.forEach((ix, j) => {
      const { value, incidents } = values[i][j], st = indexStep(value), ink = st.dark ? "#FFFFFF" : "#1B1725";
      parts.push(`<rect x="${cx(j) + 2}" y="${y}" width="${colW - 4}" height="${rowH}" fill="${st.color}"/>
        <text x="${cx(j) + colW / 2}" y="${y + 22}" text-anchor="middle" font-size="17" font-weight="700" fill="${ink}">${fmtIndex(value)}</text>
        <text x="${cx(j) + colW / 2}" y="${y + 37}" text-anchor="middle" font-size="10.5" fill="${ink}">${incidents} incident${incidents === 1 ? "" : "s"}</text>`);
    });
  });
  const bodyHeight = headH + countries.length * (rowH + 3) + 8;
  return frame({ title, subtitle, width, bodyHeight, body: parts.join("") });
}
