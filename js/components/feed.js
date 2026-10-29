/**
 * Incident feed (right column, beside the map). Shows every incident,
 * newest first, narrowed by the selected country and the filters below.
 * The filters also drive the map's bubble counts and rings.
 *
 *   Sector chips   multi-select, coloured like the map's rings
 *   Actor          Russia / China / United States / S7+ states
 *   Period         all time or one month
 *   Search         title and description text
 *
 * Reads:  state.country, state.filters
 * Writes: filters, country (clearing the country chip)
 * DOM:    #feedList, #feedSummary, #feedSectors, #feedActor, #feedPeriod,
 *         #feedSearch, #feedScope
 *
 * The list renders 15 items at a time and adds more as it is scrolled to
 * the bottom (a "Show more" button at the end does the same for keyboards).
 */
import { byId, domain, esc, fmtDate, monthLabel, plural } from "../util.js";
import { REGION_WIDE } from "../data.js";
import { feedIncidents, isFiltered } from "../filters.js";
import { severityColor } from "../scales.js";

const PAGE = 15;

export function createFeed(ctx) {
  const { cfg, incidents, months, store } = ctx;
  const sectorOf = Object.fromEntries(cfg.sectors.map((s) => [s.key, s]));
  const actorLabel = Object.fromEntries(cfg.indices.map((ix) => [ix.actor, ix.actorLabel]));
  let shown = PAGE;

  const list = byId("feedList"), summary = byId("feedSummary"), scope = byId("feedScope");
  const sectorBox = byId("feedSectors"), actorSel = byId("feedActor"), periodSel = byId("feedPeriod"), search = byId("feedSearch");

  /** Patch the shared filters (and reset paging). */
  const setFilters = (patch) => { shown = PAGE; store.set({ filters: { ...store.get().filters, ...patch } }); };

  /* ---- controls (built once) ---- */
  sectorBox.innerHTML = cfg.sectors.map((s) =>
    `<button class="sector-chip" data-s="${esc(s.key)}" style="--c:${s.color}"><i></i>${esc(s.label)}</button>`).join("");
  sectorBox.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const cur = new Set(store.get().filters.sectors);
    cur.has(b.dataset.s) ? cur.delete(b.dataset.s) : cur.add(b.dataset.s);
    setFilters({ sectors: cfg.sectors.map((s) => s.key).filter((k) => cur.has(k)) });
  }));
  actorSel.innerHTML = `<option value="all">All actors</option>` + cfg.indices.map((ix) => `<option value="${ix.actor}">${esc(ix.actorLabel)}</option>`).join("");
  periodSel.innerHTML = `<option value="all">All time</option>` + [...months].reverse().map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
  actorSel.addEventListener("change", () => setFilters({ actor: actorSel.value }));
  periodSel.addEventListener("change", () => setFilters({ period: periodSel.value }));
  search.addEventListener("input", () => setFilters({ search: search.value }));
  const loadMore = () => { shown += PAGE; render(store.get()); };
  list.addEventListener("click", (e) => { if (e.target.closest(".feed-more button")) loadMore(); });
  // Infinite scroll: near the bottom of the list, render the next page.
  list.addEventListener("scroll", () => {
    if (list.querySelector(".feed-more") && list.scrollTop + list.clientHeight > list.scrollHeight - 120) loadMore();
  });
  // Descriptions are clamped to three lines; click (or Enter) toggles the full text.
  list.addEventListener("click", (e) => e.target.closest(".feed-desc")?.classList.toggle("is-open"));
  list.addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.closest(".feed-desc")?.classList.toggle("is-open"); });

  /** Severity badge: coloured square with the level and its label. */
  function badge(sev) {
    const label = sev == null ? "Unrated" : cfg.severityLevels[Math.max(1, sev)].label;
    return `<span class="sev"><span class="sev-num" style="background:${severityColor(cfg, sev)};color:${sev >= 3 ? "#fff" : "#1B1725"}">${sev ?? "–"}</span>${esc(label)}</span>`;
  }

  /** One incident. */
  function item(inc) {
    const sectors = inc.types.map((t) => `<span class="chip"><i class="chip-swatch" style="background:${sectorOf[t]?.color || "#999"}"></i>${esc(sectorOf[t]?.label || t)}</span>`).join("");
    const actors = inc.actors.map((a) => esc(actorLabel[a])).join(", ");
    return `<li class="feed-item">
      <div class="feed-meta"><span>${fmtDate(inc.date)} · <b>${esc(inc.location || REGION_WIDE)}</b>${inc.scored ? "" : " (not scored)"}</span>${badge(inc.severity)}</div>
      <h3>${esc(inc.title)}</h3>
      <p class="feed-desc" tabindex="0" title="Show full description">${esc(inc.description)}</p>
      <div class="feed-tags">${sectors}</div>
      <div class="feed-foot"><span class="feed-actors">${actors ? `Actors: ${actors}` : ""}</span>${inc.link ? `<a href="${esc(inc.link)}" target="_blank" rel="noopener">${esc(domain(inc.link))} ↗</a>` : ""}</div>
    </li>`;
  }

  function render(state) {
    const f = state.filters;
    // Sync controls.
    sectorBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(f.sectors.includes(b.dataset.s))));
    actorSel.value = f.actor; periodSel.value = f.period;
    if (search.value !== f.search) search.value = f.search;

    // Scope chips: selected country or map pin, plus "clear filters".
    const chips = [];
    if (f.location) chips.push(`<span class="chip">Location: ${esc(f.location)} <button data-clear="location" aria-label="Clear location">×</button></span>`);
    else if (state.country) chips.push(`<span class="chip">Country: ${esc(state.country)} <button data-clear="country" aria-label="Show all countries">×</button></span>`);
    if (isFiltered({ ...f, location: null })) chips.push(`<button class="link-btn" data-clear="filters">Clear filters</button>`);
    scope.innerHTML = chips.join("");
    scope.querySelectorAll("[data-clear]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.clear;
      if (k === "country") store.set({ country: null });
      else if (k === "location") setFilters({ location: null });
      else setFilters({ sectors: [], actor: "all", period: "all", search: "" });
    }));

    const rows = feedIncidents(incidents, state).sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row);
    summary.textContent = `${plural(rows.length, "incident")}, newest first`;
    const top = list.scrollTop; // keep the scroll position when appending a page
    list.innerHTML = rows.length
      ? rows.slice(0, shown).map(item).join("") +
        (rows.length > shown ? `<li class="feed-more"><button class="btn-outline">Show more (${rows.length - shown} more)</button></li>` : "")
      : `<li class="feed-empty">No incidents match. Try clearing a filter.</li>`;
    list.scrollTop = top;
  }

  // Reset paging and scroll to the top whenever the country or filters change.
  let lastCountry, lastFilters;
  return {
    render(state) {
      if (state.country !== lastCountry || state.filters !== lastFilters) { shown = PAGE; list.scrollTop = 0; }
      lastCountry = state.country; lastFilters = state.filters;
      render(state);
    }
  };
}
