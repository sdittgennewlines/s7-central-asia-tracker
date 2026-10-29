/**
 * S7+ Central Asia Geopolitical Tracker: site configuration.
 *
 * This is the one file to edit when data sources, countries, sectors or
 * colours change. Everything else reads from here.
 */
export const CONFIG = {
  /* ---------------------------------------------------------------- data */

  // Snapshot of the "Incidents - Global" tab of the S7 + CAT Monitor sheet.
  // Rebuild with tools/build_incidents.py, or switch to live mode below.
  dataUrl: "data/incidents.json",

  // Live mode (optional). In Google Sheets: File > Share > Publish to web >
  // "Incidents - Global" tab > CSV. Paste the link here. Leave "" for the
  // snapshot. In live mode, rows with TRUE in a column named "Hide" are left
  // out (cell highlight colours are not included in CSV exports).
  sheetCsvUrl: "",

  // Country fact sheets shown in the profile panel.
  countriesUrl: "data/countries.json",

  // Country borders (Natural Earth, public domain), cropped to the region.
  geoUrl: "data/region.geo.json",

  // Analyst reports, each linking out to the New Lines website.
  reportsUrl: "data/reports.json",

  /* ----------------------------------------------------------- countries */

  // The five countries that receive index scores. Incidents located
  // anywhere else still appear on the map and in the feed.
  scoredCountries: ["Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan"],

  // Country selected when the page first loads (null = none: the page opens
  // on the regional overview).
  defaultCountry: null,

  /* ------------------------------------------------------------- sectors */

  // The eight sectors an incident can touch. Each contributes an equal
  // share (1/8 = 12.5%) of every index score. The order here is the order
  // around each country's ring on the map, and the colours were checked as
  // a set for colour-blind separation of neighbouring segments: change
  // order and colours together.
  sectors: [
    { key: "Energy", label: "Energy", color: "#C98A2B" },
    { key: "Water", label: "Water", color: "#3F7FB5" },
    { key: "Education/Culture", label: "Education & culture", color: "#C4587A" },
    { key: "Agro and Industrial", label: "Agriculture & industry", color: "#7C9440" },
    { key: "AI", label: "AI & digital", color: "#8A6BB0" },
    { key: "Transportation", label: "Transportation", color: "#2A9D8F" },
    { key: "Finance/Business", label: "Finance & business", color: "#3E4E9C" },
    { key: "Defense", label: "Defense", color: "#A0523C" }
  ],

  /* ------------------------------------------------------------- indices */

  // One index per outside actor. `actor` must match the actor column name in
  // the sheet (Russia, China, USA, S7). Colours were checked for
  // colour-blind separation as a set; change them together.
  indices: [
    { key: "RII", actor: "Russia", actorLabel: "Russia", name: "Russian Influence Index", color: "#c0392b" },
    { key: "CII", actor: "China", actorLabel: "China", name: "Chinese Influence Index", color: "#d4a017" },
    { key: "USEI", actor: "USA", actorLabel: "United States", name: "U.S. Engagement Index", color: "#2a78d6" },
    { key: "SIRI", actor: "S7", actorLabel: "S7+ states", name: "S7+ Integration Readiness Index", color: "#1baf7a" }
  ],

  /* ------------------------------------------------------------ severity */

  // Incident severity levels (from the sheet's Legend tab). Severity applies
  // to individual incidents only.
  severityLevels: {
    1: { label: "Meeting or status quo", color: "#F3C98B" },
    2: { label: "Agreement or summit", color: "#E59A45" },
    3: { label: "Tangible outcome", color: "#C2621E" },
    4: { label: "Major outcome", color: "#8A3510" }
  }
};
