/*
 * S7+ Central Asia Tracker: site configuration.
 * This is the only file that needs editing when the tracker moves hosts.
 */
window.S7CAT_CONFIG = {
  // Bundled snapshot of the "Incidents - Global" tab (rebuilt from the sheet).
  dataUrl: "data/incidents.json",

  // Optional live feed: in Google Sheets choose File > Share > Publish to web,
  // pick the "Incidents - Global" tab and "Comma-separated values (.csv)", and
  // paste the link here. Leave empty to use the bundled snapshot.
  // To hide a row in live mode (e.g. a broken link), add a column named "Hide"
  // and enter TRUE in it; cell colours do not survive CSV export.
  sheetCsvUrl: "",

  // Country borders (Natural Earth, public domain), cropped to the region.
  geoUrl: "data/region.geo.json",

  // Analyst reports, linked out to the New Lines website.
  reportsUrl: "data/reports.json",

  // Countries that receive a severity score. Others still appear as incidents.
  scoredCountries: ["Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan"],

  // Sectors, each weighted equally in a country's severity score.
  sectors: ["Energy", "Water", "Education/Culture", "AI", "Transportation", "Agro and Industrial", "Finance/Business", "Defense"],

  actors: [
    { key: "Russia", label: "Russia", color: "#c0392b" },
    { key: "China", label: "China", color: "#d4a017" },
    { key: "USA", label: "United States", color: "#2a78d6" },
    { key: "S7", label: "S7", color: "#1baf7a" }
  ]
};
