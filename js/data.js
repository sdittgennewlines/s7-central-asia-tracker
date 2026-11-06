/**
 * data.js: loading the data files the page needs.
 *
 * data/incidents.json is rebuilt every night from the Google Sheet by
 * tools/update_data.py (see .github/workflows/nightly-data.yml). That script
 * does all the cleaning and checking, so the page can trust the file.
 *
 * Every incident has this shape:
 *
 *   {
 *     row:         sheet row number (stable id)
 *     date:        "2026-10-28"
 *     types:       ["Energy", "Water"]          sector keys (at least one)
 *     severity:    1-4
 *     locations:   ["Kazakhstan", "Uzbekistan"] one or more of the five countries
 *     actors:      ["China", "S7"]              at least one
 *     title, description, link
 *   }
 *
 * An incident listing several countries appears in each country's feed and
 * counts toward each country's indices.
 */

/** Fetch and parse a JSON file; rejects on HTTP errors. */
export async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-cache" }); // always pick up the nightly update
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Load incidents. Returns { incidents, updatedAt }.
 * (Older snapshots used a single `location` string; convert those.)
 */
export async function loadIncidents(cfg) {
  const snap = await loadJSON(cfg.dataUrl);
  const incidents = snap.incidents.map((i) => i.locations ? i : { ...i, locations: [i.location].filter(Boolean) });
  return { incidents, updatedAt: snap.updatedAt || snap.generated };
}

/** Sorted list of month keys ("2026-01" ...) present in the incidents. */
export function monthsIn(incidents) {
  return [...new Set(incidents.map((i) => i.date.slice(0, 7)))].sort();
}
