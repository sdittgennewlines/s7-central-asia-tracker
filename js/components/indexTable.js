/**
 * Index table: the four indices for all five countries in the selected
 * month, shaded light blue by value. Sits under the map. Clicking a row
 * selects that country.
 *
 * Reads:  state.country, state.month
 * Writes: country
 * DOM:    #indexTable, #indexTableSub, #indexTableLegend
 */
import { byId, esc, fmtIndex, monthLabel, plural } from "../util.js";
import { INDEX_STEPS, indexStep } from "../scales.js";
import * as tooltip from "../tooltip.js";

export function createIndexTable(ctx) {
  const { cfg, scorer, store } = ctx;
  const el = byId("indexTable");
  const sub = byId("indexTableSub");
  const legend = byId("indexTableLegend");

  // Legend: the light-blue steps (static).
  legend.innerHTML = INDEX_STEPS.map((s) => `<span class="it-legend-item"><i style="background:${s.color}"></i>${s.label}</span>`).join("");

  function render(state) {
    sub.textContent = `${monthLabel(state.month)}. Each index runs from 0 to 100. Numbers in brackets are incident counts. Select a country to explore it.`;

    const head = `<tr><th scope="col"></th>${cfg.indices.map((ix) => `<th scope="col"><span class="it-key"><span class="swatch" style="background:${ix.color}"></span>${ix.key}</span><span class="it-name">${esc(ix.name)}</span></th>`).join("")}</tr>`;

    const rows = cfg.scoredCountries.map((c) => {
      const cells = cfg.indices.map((ix) => {
        const r = scorer.index(c, ix.key, state.month), st = indexStep(r.value);
        return `<td style="background:${st.color};color:${st.dark ? "#fff" : "#1B1725"}" data-c="${c}" data-ix="${ix.key}"><b>${fmtIndex(r.value)}</b><small>(${r.incidents})</small></td>`;
      }).join("");
      return `<tr class="${c === state.country ? "is-selected" : ""}" data-c="${c}"><th scope="row"><button class="it-country" data-c="${c}">${c}</button></th>${cells}</tr>`;
    }).join("");

    el.innerHTML = `<div class="table-scroll"><table class="it-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;

    el.querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", () => store.set({ country: tr.dataset.c, highlight: null, feed: { ...store.get().feed, location: null } })));
    el.querySelectorAll("td[data-ix]").forEach((td) => {
      const ix = cfg.indices.find((i) => i.key === td.dataset.ix);
      const r = scorer.index(td.dataset.c, ix.key, state.month);
      tooltip.bind(td, () => `<b>${td.dataset.c} · ${esc(ix.name)}</b><br>${fmtIndex(r.value)} of 100 · ${plural(r.incidents, "incident")} in ${monthLabel(state.month)}`);
    });
  }

  return { render };
}
