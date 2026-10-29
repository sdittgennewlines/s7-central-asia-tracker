/**
 * data.js: loading and normalising every data file the page needs.
 *
 * Every incident, whether from the JSON snapshot or the live Google Sheet
 * CSV, ends up in the same shape:
 *
 *   {
 *     row:         sheet row number (stable id)
 *     date:        "2026-10-28"
 *     types:       ["Energy", "Water"]     sector keys, may be empty
 *     severity:    1-4, 0, or null (unrated)
 *     location:    "Kazakhstan"            cleaned location text
 *     scored:      true if location is one of the five scored countries
 *     actors:      ["China", "S7"]         actor keys flagged TRUE
 *     title, description, link
 *   }
 */

/** Label used for incidents with no single location ("Central Asia", blank). */
export const REGION_WIDE = "Region-wide";

/** Fetch and parse a JSON file; rejects on HTTP errors. */
export async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Load incidents: live sheet CSV when configured (falling back to the
 * snapshot if the sheet can't be reached), otherwise the JSON snapshot.
 * Returns { incidents, live, generated }.
 */
export async function loadIncidents(cfg) {
  if (cfg.sheetCsvUrl) {
    try {
      const res = await fetch(cfg.sheetCsvUrl);
      if (!res.ok) throw new Error(`sheet: HTTP ${res.status}`);
      return { incidents: normalizeCsv(await res.text(), cfg), live: true };
    } catch (err) {
      console.warn("Live sheet unavailable, using snapshot.", err);
    }
  }
  const snap = await loadJSON(cfg.dataUrl);
  return { incidents: snap.incidents, live: false, generated: snap.generated };
}

/** Where an incident sits for feed/map grouping: a scored country, another place, or region-wide. */
export function locationKey(inc) {
  if (inc.scored) return inc.location;
  return inc.location && !/central asia/i.test(inc.location) ? inc.location : REGION_WIDE;
}

/** Sorted list of month keys ("2026-01" ...) present in the incidents. */
export function monthsIn(incidents) {
  return [...new Set(incidents.map((i) => i.date.slice(0, 7)))].sort();
}

/* ------------------------------------------------------------ CSV (live) */

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Turn the sheet's CSV export into normalised incidents (same cleaning as tools/build_incidents.py). */
function normalizeCsv(text, cfg) {
  const rows = parseCsv(text);
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name.toLowerCase());
  const C = {
    date: col("Date & Time"), type: col("Type"), sev: col("Severity"), loc: col("Location"),
    title: col("Title"), desc: col("Description"), link: col("Link"), hide: col("Hide")
  };
  const sectorByLower = Object.fromEntries(cfg.sectors.map((s) => [s.key.toLowerCase(), s.key]));
  const actorCols = cfg.indices.map((ix) => [ix.actor, col(ix.actor)]);
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  const out = [];
  rows.forEach((r, i) => {
    const m = clean(r[C.date]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return;                                                 // blank or malformed row
    if (C.hide >= 0 && /^true$/i.test(clean(r[C.hide]))) return;    // analyst asked to hide
    const sev = parseInt(r[C.sev], 10);
    const location = clean(r[C.loc]);
    out.push({
      row: i + 2,
      date: `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
      types: clean(r[C.type]).split(",").map((t) => sectorByLower[t.trim().toLowerCase()]).filter(Boolean),
      severity: Number.isNaN(sev) ? null : sev,
      location,
      scored: cfg.scoredCountries.includes(location),
      actors: actorCols.filter(([, j]) => j >= 0 && /^true$/i.test(clean(r[j]))).map(([a]) => a),
      title: clean(r[C.title]),
      description: clean(r[C.desc]),
      link: clean(r[C.link])
    });
  });
  return out;
}
