/**
 * filters.js: the incident filters shared by the map and the feed.
 *
 * The map's bubble counts and sector rings and the feed list are both
 * computed from the same filters, so they always agree. The only
 * difference: the map ignores the selected country (it shows every
 * country), while the feed shows only the selected country (or all
 * countries when none is selected).
 *
 * Filter shape (state.filters):
 *   sectors   null        null = all sectors; otherwise the array of sector
 *                         keys to keep (the checked boxes). [] = none.
 *   actor     "all"       or an actor key (Russia, China, USA, S7)
 *   period    "all"       or a month key ("2026-10")
 *   search    ""          free text matched against title + description
 */

/** True if the incident passes the sector/actor/period/search filters. */
export function passes(inc, f) {
  if (f.sectors && !inc.types.some((t) => f.sectors.includes(t))) return false;
  if (f.actor !== "all" && !inc.actors.includes(f.actor)) return false;
  if (f.period !== "all" && !inc.date.startsWith(f.period)) return false;
  const q = f.search.trim().toLowerCase();
  if (q && !`${inc.title} ${inc.description}`.toLowerCase().includes(q)) return false;
  return true;
}

/** Sectors of an incident that count under the current sector filter. */
export function visibleSectors(inc, f) {
  return f.sectors ? inc.types.filter((t) => f.sectors.includes(t)) : inc.types;
}

/** Incidents for the feed: filters + selected country (an incident in several countries shows in each). */
export function feedIncidents(incidents, state) {
  return incidents.filter((i) => passes(i, state.filters) && (!state.country || i.locations.includes(state.country)));
}

/** True when any filter is narrowing the incidents. */
export function isFiltered(f) {
  return f.sectors !== null || f.actor !== "all" || f.period !== "all" || !!f.search.trim();
}
