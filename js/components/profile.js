/**
 * Profile: fact sheet for the selected country (leader, economy,
 * governance indicators), with sources listed underneath.
 *
 * Reads:  state.country
 * Writes: nothing
 * DOM:    #profile
 * Data:   data/countries.json ("fields" defines labels/format/source once;
 *         "countries" holds the values)
 */
import { byId, esc, fmtMoney, fmtPeople } from "../util.js";

/** Format one value according to its field's `format`. null -> "Not available". */
function formatValue(format, v) {
  if (v == null) return null;
  switch (format) {
    case "people": return fmtPeople(v);
    case "usd": return fmtMoney(v);
    case "intl": return fmtMoney(v, "Int$");
    case "intlExact": return `Int$${v.toLocaleString("en-US")}`;
    case "pct": return `${v}%`;
    case "outOf100": return `${v}<small>/100</small>`;
    case "outOf10": return `${v.toFixed(2)}<small>/10</small>`;
    case "gini": return v.toFixed(2);
    case "cpi": return `${v.score}<small>/100</small> <span class="prof-rank">rank ${v.rank}</span>`;
    default: return esc(v);
  }
}

export function createProfile(ctx) {
  const { profiles } = ctx;
  const el = byId("profile");

  function render(state) {
    const c = state.country;
    const p = profiles?.countries?.[c];
    if (!p) { el.innerHTML = `<h2 class="prof-name">${esc(c)}</h2><p class="muted">No profile data yet.</p>`; return; }

    const facts = profiles.fields.map((f) => {
      const val = formatValue(f.format, p[f.key]);
      return `<div class="prof-fact"${f.hint ? ` title="${esc(f.hint)}"` : ""}>
        <dt>${esc(f.label)}</dt>
        <dd${val == null ? ' class="is-na"' : ""}>${val ?? "Not available"}</dd>
      </div>`;
    }).join("");

    // Sources: leader source plus one line per field (deduplicated).
    const sources = [...new Set([`Head of state: ${p.leader.source}`, ...profiles.fields.map((f) => `${f.label}: ${f.source}`)])];

    el.innerHTML = `
      <span class="eyebrow">COUNTRY PROFILE</span>
      <h2 class="prof-name">${esc(c)}</h2>
      <div class="prof-leader">
        <span class="prof-leader-title">${esc(p.leader.title)}</span>
        <span class="prof-leader-name">${esc(p.leader.name)}</span>
        ${p.leader.note ? `<span class="prof-leader-note">${esc(p.leader.note)}</span>` : ""}
      </div>
      <dl class="prof-facts">${facts}</dl>
      <details class="prof-sources"><summary>Sources and definitions</summary>
        <ul>${sources.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <ul class="prof-hints">${profiles.fields.filter((f) => f.hint).map((f) => `<li><b>${esc(f.label)}:</b> ${esc(f.hint)}</li>`).join("")}</ul>
      </details>`;
  }

  return { render };
}
