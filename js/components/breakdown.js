/**
 * Breakdown: how the selected month's index scores are built from the
 * eight sectors. One row per sector, one column per index shown on the
 * chart. Each cell is a mini bar out of the sector's maximum share
 * (12.5 points), so the column adds up to the index value in the total row.
 *
 * Sits under the index table; follows the month picked on the chart.
 *
 * Reads:  state.country, state.month, state.indices
 * Writes: nothing
 * DOM:    #breakdown, #breakdownTitle
 */
import { byId, esc, fmtIndex, monthLabel, plural } from "../util.js";
import * as tooltip from "../tooltip.js";

export function createBreakdown(ctx) {
  const { cfg, scorer } = ctx;
  const el = byId("breakdown");
  const title = byId("breakdownTitle");
  const maxPoints = 100 / cfg.sectors.length; // 12.5 with eight sectors

  function render(state) {
    title.textContent = `How ${state.country}'s ${monthLabel(state.month)} scores add up`;
    const shown = cfg.indices.filter((ix) => state.indices.includes(ix.key));
    const results = shown.map((ix) => ({ ix, r: scorer.index(state.country, ix.key, state.month) }));

    const head = `<tr><th scope="col">Sector <small>(max ${maxPoints} pts)</small></th>${shown.map((ix) => `<th scope="col"><span class="swatch" style="background:${ix.color}"></span>${ix.key}</th>`).join("")}</tr>`;

    const rows = cfg.sectors.map((sec, si) => `<tr><th scope="row">${esc(sec.label)}</th>${results.map(({ ix, r }) => {
      const cell = r.sectors[si];
      const pct = (cell.points / maxPoints) * 100;
      return `<td data-ix="${ix.key}" data-si="${si}"><span class="bd-cell"><span class="bd-track"><span class="bd-fill" style="width:${pct}%;background:${ix.color}"></span></span><span class="bd-val${cell.points ? "" : " is-zero"}">${fmtIndex(cell.points)}</span></span></td>`;
    }).join("")}</tr>`).join("");

    const total = `<tr class="bd-total"><th scope="row">Index score</th>${results.map(({ r }) => `<td><b>${fmtIndex(r.value)}</b><small> / 100</small></td>`).join("")}</tr>`;

    el.innerHTML = `<table class="bd-table"><thead>${head}</thead><tbody>${rows}${total}</tbody></table>
      <p class="note">Each sector adds up to ${maxPoints} points: its average incident severity (0–100) × 12.5%. A sector with no incidents adds 0.</p>`;

    // Hover: explain the arithmetic for one cell.
    el.querySelectorAll("td[data-ix]").forEach((td) => {
      const { ix, r } = results.find((x) => x.ix.key === td.dataset.ix);
      const cell = r.sectors[+td.dataset.si];
      tooltip.bind(td, () => cell.n
        ? `<b>${esc(cell.label)} · ${ix.key}</b><br>${plural(cell.n, "incident")}, average severity ${Math.round(cell.score)}/100<br>${Math.round(cell.score)} × 12.5% = <b>${fmtIndex(cell.points)} points</b>`
        : `<b>${esc(cell.label)} · ${ix.key}</b><br>No rated incidents this month: 0 points`);
    });
  }

  return { render };
}
