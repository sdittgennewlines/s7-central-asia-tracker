/**
 * Incident feed: incidents for the selected country (or a non-scored
 * location picked from a map pin), filtered by month, actor, sector and
 * free text. Each item shows its severity badge, sectors, actors and source.
 *
 * Reads:  state.country, state.month, state.highlight, state.feed
 * Writes: feed (all filters)
 * DOM:    #feedList, #feedSummary, #feedActor, #feedSector, #feedMonthToggle,
 *         #feedSearch, #feedMore, #feedLocation
 */
import { byId, domain, esc, fmtDate, monthLabel, plural } from "../util.js";
import { REGION_WIDE, locationKey } from "../data.js";
import { severityColor } from "../scales.js";

const PAGE = 10;

export function createFeed(ctx) {
  const { cfg, incidents, store } = ctx;
  const actorLabel = Object.fromEntries(cfg.indices.map((ix) => [ix.actor, ix.actorLabel]));
  const actorColor = Object.fromEntries(cfg.indices.map((ix) => [ix.actor, ix.color]));
  const sectorLabel = Object.fromEntries(cfg.sectors.map((s) => [s.key, s.label]));

  const list = byId("feedList"), summary = byId("feedSummary"), more = byId("feedMore");
  const actorSel = byId("feedActor"), sectorSel = byId("feedSector"), monthToggle = byId("feedMonthToggle");
  const search = byId("feedSearch"), locBox = byId("feedLocation");

  /* ---- filter controls (built once) ---- */
  actorSel.innerHTML = `<option value="all">All actors</option>` + cfg.indices.map((ix) => `<option value="${ix.actor}">${esc(ix.actorLabel)}</option>`).join("");
  sectorSel.innerHTML = `<option value="all">All sectors</option>` + cfg.sectors.map((s) => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join("");
  actorSel.addEventListener("change", () => store.setFeed({ actor: actorSel.value, shown: PAGE }));
  sectorSel.addEventListener("change", () => store.setFeed({ sector: sectorSel.value, shown: PAGE }));
  monthToggle.addEventListener("change", () => store.setFeed({ allMonths: monthToggle.checked, shown: PAGE }));
  search.addEventListener("input", () => store.setFeed({ search: search.value, shown: PAGE }));
  more.addEventListener("click", () => store.setFeed({ shown: store.get().feed.shown + PAGE }));

  /** Apply the feed filters to the full incident list. */
  function select(state) {
    const f = state.feed, q = f.search.trim().toLowerCase();
    return incidents.filter((i) =>
      (f.location ? locationKey(i) === f.location : i.location === state.country) &&
      (f.allMonths || i.date.startsWith(state.month)) &&
      (f.actor === "all" || i.actors.includes(f.actor)) &&
      (f.sector === "all" || i.types.includes(f.sector)) &&
      (!q || `${i.title} ${i.description}`.toLowerCase().includes(q))
    ).sort((a, b) => b.date.localeCompare(a.date) || (b.severity || 0) - (a.severity || 0));
  }

  /** Severity badge: coloured square with the level number and its label. */
  function badge(sev) {
    const dark = sev >= 3;
    const label = sev == null ? "Unrated" : cfg.severityLevels[Math.max(1, sev)].label;
    return `<span class="sev"><span class="sev-num" style="background:${severityColor(cfg, sev)};color:${dark ? "#fff" : "#1B1725"}">${sev ?? "–"}</span>${esc(label)}</span>`;
  }

  /** One feed item. */
  function item(inc, highlighted) {
    const actors = inc.actors.map((a) => `<span class="chip"><span class="swatch" style="background:${actorColor[a]}"></span>${esc(actorLabel[a])}</span>`).join("");
    const sectors = inc.types.map((t) => `<span class="chip">${esc(sectorLabel[t] || t)}</span>`).join("");
    return `<li class="feed-item${highlighted ? " is-highlighted" : ""}" id="incident-${inc.row}">
      <div class="feed-meta">${fmtDate(inc.date)} ${badge(inc.severity)}</div>
      <h3>${esc(inc.title)}</h3>
      <p>${esc(inc.description)}</p>
      <div class="feed-tags">${inc.scored ? "" : `<span class="chip">${esc(inc.location || REGION_WIDE)} · not scored</span>`}${sectors}${actors}
        ${inc.link ? `<a class="feed-src" href="${esc(inc.link)}" target="_blank" rel="noopener">${esc(domain(inc.link))} ↗</a>` : ""}</div>
    </li>`;
  }

  function render(state) {
    const f = state.feed;
    actorSel.value = f.actor; sectorSel.value = f.sector; monthToggle.checked = f.allMonths;
    if (search.value !== f.search) search.value = f.search;

    // Location chip when a map pin (non-scored place) is driving the feed.
    locBox.innerHTML = f.location ? `<span class="chip">Showing: ${esc(f.location)} <button aria-label="Back to ${esc(state.country)}">×</button></span>` : "";
    locBox.querySelector("button")?.addEventListener("click", () => store.setFeed({ location: null }));

    let rows = select(state);
    // Make sure a highlighted incident is rendered even if it's beyond the first page.
    const hi = rows.findIndex((r) => r.row === state.highlight);
    const shown = Math.max(f.shown, hi + 1);

    const where = f.location || state.country;
    summary.textContent = `${plural(rows.length, "incident")} · ${where} · ${f.allMonths ? "all months" : monthLabel(state.month)}`;
    list.innerHTML = rows.length
      ? rows.slice(0, shown).map((inc) => item(inc, inc.row === state.highlight)).join("")
      : `<li class="feed-empty">No incidents match. Try "All months" or clear a filter.</li>`;
    more.hidden = rows.length <= shown;
    more.textContent = `Show more (${rows.length - shown} more)`;

    if (hi >= 0) byId(`incident-${state.highlight}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return { render };
}
