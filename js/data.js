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

/** The current month in New York ("2026-11"), regardless of the viewer's time zone. */
export function currentMonthKey(timeZone = "America/New_York", now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}

/**
 * Months that indices are shown for: every month from the first incident up
 * to the last COMPLETED month (the current month is still collecting
 * incidents, so its scores would be artificially low). Months with no
 * incidents are included, since they score 0.
 */
export function completedMonths(incidents, timeZone) {
  const first = monthsIn(incidents)[0];
  const current = currentMonthKey(timeZone);
  const out = [];
  if (!first) return out;
  let [y, m] = first.split("-").map(Number);
  for (let key = first; key < current; ) {
    out.push(key);
    m += 1; if (m > 12) { m = 1; y += 1; }
    key = `${y}-${String(m).padStart(2, "0")}`;
  }
  return out;
}

/** Sorted list of month keys ("2026-01" ...) present in the incidents. */
export function monthsIn(incidents) {
  return [...new Set(incidents.map((i) => i.date.slice(0, 7)))].sort();
}
