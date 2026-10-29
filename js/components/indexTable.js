/**
 * Index table: the four indices (RII, CII, USEI, SIRI) for all five
 * countries over a window of months, shaded light blue by value.
 *
 * Not a standalone component: breakdown.js shows it when no country is
 * selected. Clicking a row selects that country.
 *
 * renderCountryTable(el, ctx, windowKeys) draws into `el`.
 */
import { esc, fmtIndex, plural } from "../util.js";
import { INDEX_STEPS, indexStep } from "../scales.js";
import * as tooltip from "../tooltip.js";

export function renderCountryTable(el, ctx, keys) {
  const { cfg, scorer, store } = ctx;

  const head = `<tr><th scope="col"></th>${cfg.indices.map((ix) => `<th scope="col"><span class="it-key">${ix.key}</span><span class="it-name">${esc(ix.name)}</span></th>`).join("")}</tr>`;
  const rows = cfg.scoredCountries.map((c) => `<tr data-c="${c}"><th scope="row"><button class="it-country" data-c="${c}">${c}</button></th>${cfg.indices.map((ix) => {
    const r = scorer.windowIndex(c, ix.key, keys), st = indexStep(r.value);
    return `<td style="background:${st.color};color:${st.dark ? "#fff" : "#1B1725"}" data-c="${c}" data-ix="${ix.key}"><b>${fmtIndex(r.value)}</b><small>(${r.incidents})</small></td>`;
  }).join("")}</tr>`).join("");
  const legend = `<div class="it-legend" aria-label="Shading key">${INDEX_STEPS.map((s) => `<span class="it-legend-item"><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>`;

  el.innerHTML = `<div class="table-scroll"><table class="it-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>${legend}`;

  el.querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", () => { tooltip.hide(); store.set({ country: tr.dataset.c }); }));
  el.querySelectorAll("td[data-ix]").forEach((td) => {
    const ix = cfg.indices.find((i) => i.key === td.dataset.ix);
    const r = scorer.windowIndex(td.dataset.c, ix.key, keys);
    tooltip.bind(td, () => `<b>${td.dataset.c} · ${esc(ix.name)}</b><br>${fmtIndex(r.value)} of 100 · ${plural(r.incidents, "incident")}<br><span class="tt-hint">Select to see how it adds up</span>`);
  });
}
