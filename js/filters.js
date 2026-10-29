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
 *   location  null        a non-scored place picked from a map pin
 */
import { locationKey } from "./data.js";

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

/** Incidents for the feed: filters + selected country (or picked location). */
export function feedIncidents(incidents, state) {
  const f = state.filters;
  return incidents.filter((i) => {
    if (!passes(i, f)) return false;
    if (f.location) return locationKey(i) === f.location;
    return state.country ? i.location === state.country : true;
  });
}

/** True when any filter is narrowing the incidents. */
export function isFiltered(f) {
  return f.sectors !== null || f.actor !== "all" || f.period !== "all" || !!f.search.trim() || !!f.location;
}
