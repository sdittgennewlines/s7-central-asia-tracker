/**
 * Reports: cards linking to Central Asia Center analysis on the New Lines
 * website. Static: rendered once from data/reports.json.
 *
 * DOM: #reportList
 */
import { byId, esc } from "../util.js";

export function renderReports(reports) {
  const el = byId("reportList");
  if (!reports.length) {
    el.innerHTML = `<div class="report-empty">Analysis from Central Asia Center researchers will be listed here as it is published, each linking to the full report on the New Lines website.</div>`;
    return;
  }
  el.innerHTML = `<div class="report-grid">${reports.map((r) => `
    <a class="report" href="${esc(r.url)}">
      <span class="report-meta">${esc([r.date, r.author].filter(Boolean).join(" · ").toUpperCase())}</span>
      <span class="report-title">${esc(r.title)}</span>
      ${r.summary ? `<span class="report-summary">${esc(r.summary)}</span>` : ""}
      <span class="report-go">READ THE REPORT →</span>
    </a>`).join("")}</div>`;
}
