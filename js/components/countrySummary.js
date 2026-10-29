/**
 * Country summary: the selected country's name (the largest heading on the
 * page after the title), its head of state and a compact strip of key
 * facts. Sits right under the map, two-thirds wide.
 *
 * With no country selected it shows a short prompt and one button per
 * country instead.
 *
 * Reads:  state.country
 * Writes: country (prompt buttons, clear button)
 * DOM:    #countrySummary
 * Data:   data/countries.json ("fields" defines labels and sources once;
 *         "countries" holds each country's values as plain text, shown
 *         exactly as written: no reformatting)
 */
import { byId, esc } from "../util.js";

export function createCountrySummary(ctx) {
  const { cfg, profiles, store } = ctx;
  const el = byId("countrySummary");

  /** No country selected: prompt with quick-pick buttons. */
  function renderPrompt() {
    el.innerHTML = `
      <div class="cs-head">
        <h2 class="cs-name">Central Asia</h2>
        <p class="cs-prompt">Select a country on the map, or pick one here, to see its profile, its four indices and how they add up.</p>
      </div>
      <div class="cs-picks">${cfg.scoredCountries.map((c) => `<button class="btn-outline" data-c="${c}">${c}</button>`).join("")}</div>`;
    el.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => store.set({ country: b.dataset.c })));
  }

  function render(state) {
    const c = state.country;
    if (!c) return renderPrompt();
    const p = profiles?.countries?.[c];

    const facts = (profiles?.fields || []).map((f) => {
      const val = p?.[f.key] ?? "N/A";
      return `<div class="cs-fact"${f.hint ? ` title="${esc(f.hint)}"` : ""}><dt>${esc(f.label)}</dt><dd${val === "N/A" ? ' class="is-na"' : ""}>${esc(val)}</dd></div>`;
    }).join("");
    const sources = p ? [`Head of state: ${p.leader.source}`, ...profiles.fields.map((f) => `${f.label}: ${f.source}`)] : [];

    el.innerHTML = `
      <div class="cs-head">
        <div>
          <span class="eyebrow">COUNTRY PROFILE</span>
          <h2 class="cs-name">${esc(c)}</h2>
        </div>
        ${p ? `<div class="cs-leader"><span class="cs-leader-title">${esc(p.leader.title)}</span> <span class="cs-leader-name">${esc(p.leader.name)}</span>${p.leader.note ? `<span class="cs-leader-note">${esc(p.leader.note)}</span>` : ""}</div>` : ""}
        <button class="link-btn cs-clear" aria-label="Clear country selection">Back to all of Central Asia</button>
      </div>
      ${p ? `<dl class="cs-facts">${facts}</dl>
      <details class="cs-sources"><summary>Sources and definitions</summary>
        <ul>${sources.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <ul>${profiles.fields.filter((f) => f.hint).map((f) => `<li><b>${esc(f.label)}:</b> ${esc(f.hint)}</li>`).join("")}</ul>
      </details>` : `<p class="muted">No profile data yet.</p>`}`;
    el.querySelector(".cs-clear").addEventListener("click", () => store.set({ country: null }));
  }

  return { render };
}
