/**
 * exportDialog.js: the "Download" pop-up (same design as the GFP platform).
 *
 *   ┌ DOWNLOAD ─────────────────────────────── × ┐
 *   │ Influence indices: Kazakhstan               │
 *   │ Jan–Oct 2026 · monthly index, 0–100         │
 *   │ [ CSV ]   [ Excel ]   [ PNG image ]         │
 *   └─────────────────────────────────────────────┘
 *
 * openExport(spec) opens it. A spec describes one chart's data once, and the
 * dialog turns it into whichever format the reader picks:
 *
 *   {
 *     title:    "Influence indices: Kazakhstan",
 *     subtitle: "Jan–Oct 2026 · monthly index, 0–100",
 *     filename: "influence-indices-kazakhstan-2026-10"   (no extension)
 *     columns:  [{ label: "Month", width: 16 }, ...]       (width in Excel characters)
 *     rows:     [["January 2026", 12.5, ...], ...]          (numbers stay numbers)
 *     image:    () => ({ svg, width, height })            optional PNG version,
 *                                                          from export/pngCharts.js
 *   }
 *
 *   CSV   = the data only (opens anywhere).
 *   Excel = the same table with the title above and the copyright below.
 *   PNG   = the drawn chart in a standard frame with the copyright line.
 *
 * downloadButton() returns the small "Download" button for a chart header.
 * The dialog renders into #exportRoot (index.html).
 */
import { CONFIG } from "../config.js";
import { esc } from "./util.js";
import { downloadText, downloadBytes, downloadSvgAsPng, slug } from "./download.js";
import { makeXlsx } from "./lib/xlsx.js";

let current = null;   // the open spec
let lastFocus = null; // element to return focus to on close
const root = () => document.getElementById("exportRoot");

/** CSV text (RFC 4180: quote fields containing , " or line breaks). */
export function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => c.label), ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

function close() {
  root().innerHTML = "";
  current = null;
  lastFocus?.focus();
}

/** Produce the file in the chosen format, then close. */
function run(format) {
  const s = current;
  if (!s) return;
  const base = slug(s.filename || s.title);
  close();
  if (format === "csv") downloadText(toCsv(s.columns, s.rows), `${base}.csv`);
  if (format === "xlsx") {
    const bytes = makeXlsx({ sheetName: s.title, title: s.title, subtitle: s.subtitle, columns: s.columns, rows: s.rows, footer: CONFIG.copyright });
    downloadBytes(bytes, `${base}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  if (format === "png" && s.image) {
    const img = s.image();
    downloadSvgAsPng(img.svg, img.width, img.height, `${base}.png`);
  }
}

/** Wire the dialog's clicks and the Escape key once (called from main.js). */
export function initExportDialog() {
  root().addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.closest("[data-export-close]")) return close();
    const opt = t.closest("[data-format]");
    if (opt) return run(opt.dataset.format);
    if (t.classList.contains("overlay")) close(); // click on the dimmed backdrop
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && current) close(); });
}

/** Open the dialog for one chart's spec. */
export function openExport(spec) {
  current = spec;
  lastFocus = document.activeElement;
  const option = (format, label, hint) => `
    <button class="export-opt" data-format="${format}">
      <span class="f">${label}</span><span class="h">${hint}</span>
    </button>`;
  root().innerHTML = `
    <div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <button class="x" data-export-close aria-label="Close">×</button>
        <div class="dialog-head">
          <span class="eyebrow">DOWNLOAD</span>
          <h2 id="export-title">${esc(spec.title)}</h2>
          ${spec.subtitle ? `<span class="dialog-sub">${esc(spec.subtitle)}</span>` : ""}
        </div>
        <div class="export-opts">
          ${option("csv", "CSV", "The data, for any spreadsheet or data tool")}
          ${option("xlsx", "Excel", "The data as an .xlsx workbook")}
          ${spec.image ? option("png", "PNG image", "The chart as a picture") : ""}
        </div>
      </div>
    </div>`;
  root().querySelector(".export-opt").focus();
}

/** The small "Download" button placed in a chart's header. */
export const downloadButton = (id) =>
  `<button class="dl-btn" data-download="${id}" aria-label="Download this chart">
     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Download</button>`;
