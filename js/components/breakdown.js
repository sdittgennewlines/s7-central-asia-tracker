/**
 * Breakdown: "How <country>'s indices add up", for a time window the user
 * picks.
 *
 *   Window controls: an end month (‹ September 2026 ›) and a span
 *   (1 month | 3 months | All time). For example, September + 3 months =
 *   July–September; June + All time = January–June.
 *
 *   With a country selected: one row per sector, one column per index.
 *   Each cell is a bar out of the sector's maximum share (12.5 points), in
 *   the sector's colour. Each column adds up to the index in the total row.
 *
 *   With no country selected: the four indices for all five countries over
 *   the same window (see indexTable.js), so the block is never empty.
 *
 * Window scores are the average of the monthly scores (see indices.js).
 *
 * Reads:  state.country, state.window
 * Writes: window (controls), country (rows of the country table)
 * DOM:    #breakdown, #breakdownTitle, #breakdownSub, #windowEnd,
 *         #windowPrev, #windowNext, #windowSpan
 */
import { byId, esc, fmtIndex, monthLabel, plural } from "../util.js";
import { windowMonths } from "../indices.js";
import { renderCountryTable } from "./indexTable.js";
import * as tooltip from "../tooltip.js";

const SPANS = [
  { key: "1", label: "1 month" },
  { key: "3", label: "3 months" },
  { key: "all", label: "All time" }
];

/** "Jul–Sep 2026", "October 2026" or "Jan–Jun 2026" for a window. */
export function windowLabel(keys) {
  if (!keys.length) return "";
  if (keys.length === 1) return monthLabel(keys[0]);
  const [a, b] = [monthLabel(keys[0], true), monthLabel(keys[keys.length - 1], true)];
  const [am, ay] = a.split(" "), [bm, by] = b.split(" ");
  return ay === by ? `${am}–${bm} ${by}` : `${a} – ${b}`;
}

export function createBreakdown(ctx) {
  const { cfg, months, scorer, store } = ctx;
  const el = byId("breakdown");
  const title = byId("breakdownTitle");
  const sub = byId("breakdownSub");
  const endSel = byId("windowEnd"), prev = byId("windowPrev"), next = byId("windowNext"), spanSeg = byId("windowSpan");
  const maxPoints = 100 / cfg.sectors.length; // 12.5 with eight sectors

  /* ---- window controls (built once) ---- */
  endSel.innerHTML = [...months].reverse().map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
  spanSeg.innerHTML = SPANS.map((s) => `<button data-span="${s.key}">${s.label}</button>`).join("");
  const setWindow = (patch) => store.set({ window: { ...store.get().window, ...patch } });
  endSel.addEventListener("change", () => setWindow({ end: endSel.value }));
  prev.addEventListener("click", () => { const i = months.indexOf(store.get().window.end); if (i > 0) setWindow({ end: months[i - 1] }); });
  next.addEventListener("click", () => { const i = months.indexOf(store.get().window.end); if (i < months.length - 1) setWindow({ end: months[i + 1] }); });
  spanSeg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setWindow({ span: b.dataset.span })));

  /** Sector × index table for one country. */
  function renderSectorTable(country, keys) {
    const results = cfg.indices.map((ix) => ({ ix, r: scorer.windowIndex(country, ix.key, keys) }));
    const multi = keys.length > 1;

    const head = `<tr><th scope="col">Sector <small>(up to ${maxPoints} points each)</small></th>${cfg.indices.map((ix) => `<th scope="col" title="${esc(ix.name)}">${ix.key}<span class="bd-ixname">${esc(ix.actorLabel)}</span></th>`).join("")}</tr>`;
    const rows = cfg.sectors.map((sec, si) => `<tr><th scope="row"><i class="bd-swatch" style="background:${sec.color}"></i>${esc(sec.label)}</th>${results.map(({ ix, r }) => {
      const cell = r.sectors[si];
      return `<td data-ix="${ix.key}" data-si="${si}"><span class="bd-cell"><span class="bd-track"><span class="bd-fill" style="width:${(cell.points / maxPoints) * 100}%;background:${sec.color}"></span></span><span class="bd-val${cell.points ? "" : " is-zero"}">${fmtIndex(cell.points)}</span></span></td>`;
    }).join("")}</tr>`).join("");
    const total = `<tr class="bd-total"><th scope="row">${multi ? "Average index score" : "Index score"}</th>${results.map(({ r }) => `<td><b>${fmtIndex(r.value)}</b><small> / 100 · ${plural(r.incidents, "incident")}</small></td>`).join("")}</tr>`;

    el.innerHTML = `<div class="table-scroll"><table class="bd-table"><thead>${head}</thead><tbody>${rows}${total}</tbody></table></div>
      <p class="note">A sector's points = its average incident severity (0–100) × 12.5%. Sectors with no incidents add 0.${multi ? ` Over ${keys.length} months, each figure is the average of the monthly figures. Months with no incidents count as 0.` : ""}</p>`;

    // Hover: show the arithmetic behind a cell.
    el.querySelectorAll("td[data-ix]").forEach((td) => {
      const { ix, r } = results.find((x) => x.ix.key === td.dataset.ix);
      const cell = r.sectors[+td.dataset.si];
      tooltip.bind(td, () => {
        const head = `<b>${esc(cell.label)} · ${ix.key}</b><br>`;
        if (!cell.n) return `${head}No rated incidents in ${windowLabel(keys)}: 0 points`;
        return multi
          ? `${head}${plural(cell.n, "incident")} across ${keys.length} months<br>Average monthly contribution: <b>${fmtIndex(cell.points)} points</b>`
          : `${head}${plural(cell.n, "incident")}, average severity ${Math.round(cell.score)}/100<br>${Math.round(cell.score)} × 12.5% = <b>${fmtIndex(cell.points)} points</b>`;
      });
    });
  }

  function render(state) {
    const { end, span } = state.window;
    const keys = windowMonths(months, end, span);

    // Sync controls.
    endSel.value = end;
    const i = months.indexOf(end);
    prev.disabled = i <= 0;
    next.disabled = i >= months.length - 1;
    spanSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.span === span)));

    if (state.country) {
      title.textContent = `How ${state.country}'s indices add up`;
      sub.textContent = `${windowLabel(keys)}. Each index is built from eight sectors of equal weight.`;
      renderSectorTable(state.country, keys);
    } else {
      title.textContent = "The four indices across Central Asia";
      sub.textContent = `${windowLabel(keys)}. Each index runs from 0 to 100. Numbers in brackets are incident counts. Select a country to see how its scores add up.`;
      renderCountryTable(el, ctx, keys);
    }
  }

  return { render };
}
