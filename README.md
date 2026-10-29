# S7+ Central Asia Geopolitical Tracker

A static web page for the Central Asia Center at the New Lines Institute. It tracks Russian influence, Chinese influence, U.S. engagement and S7+ integration across Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan and Uzbekistan, using incidents logged by analysts in the "S7 + CAT Monitor" Google Sheet.

It has no server, database, build step or third-party libraries. Any static host can serve it: GitHub Pages, Netlify or the New Lines web server.

**Live demo:** https://sdittgennewlines.github.io/s7-central-asia-tracker/

## Project layout

```
index.html                 page structure (each block names the module that fills it)
config.js                  THE file to edit: data sources, countries, sectors, indices, colours
css/styles.css             all styles, scoped under .s7cat, in page order
js/
  main.js                  entry point: loads data, creates components, re-renders on change
  state.js                 the shared state store (what country/month/filters are selected)
  data.js                  loading + cleaning incidents (JSON snapshot or live sheet CSV)
  indices.js               the scoring model (pure functions, no DOM)
  scales.js                colour scales shared by every component
  tooltip.js               the one floating tooltip
  util.js                  formatting helpers
  components/
    toolbar.js             country picker + month navigator
    map.js                 map with incident markers and edge pins
    profile.js             country fact sheet
    indexChart.js          RII / CII / USEI / SIRI over time
    indexTable.js          the four indices for all five countries
    breakdown.js           how the 8 sectors add up to each index
    feed.js                incident feed with filters
    reports.js             links to analyst reports
data/
  incidents.json           snapshot of the "Incidents - Global" tab
  countries.json           country profiles (labels and sources defined once under "fields")
  region.geo.json          country borders (Natural Earth, public domain), cropped to the region
  reports.json             report links
assets/new-lines-logo.png
tools/                     Python scripts used to build the data files
```

### How the code fits together

1. `main.js` loads the data and creates a **store** (`state.js`) holding what's selected.
2. Each component in `js/components/` is created with a shared `ctx` (config, incidents, scorer, store) and returns `{ render(state) }`.
3. When the user clicks something, the component calls `store.set({...})`. Every component's `render` then runs with the new state.
4. Components never call each other. To add one, create `js/components/<name>.js` and add it to the list in `main.js`.

## How the indices are calculated

Each index is computed per country, per actor, per month. The code is in `js/indices.js`.

1. Take that country's incidents for the month that involve the index's actor: Russia for RII, China for CII, the U.S. for USEI, S7+ states for SIRI.
2. Rescale each incident's severity (1–4) to 0–100: 1 → 0, 2 → 33, 3 → 67, 4 → 100.
3. Average the rescaled severities within each of the 8 sectors. A sector with no incidents scores **0**. An incident tagged with several sectors counts in each.
4. Each sector contributes **12.5%**, so `index = Σ (sector score × 0.125)`, on a 0–100 scale.
5. If an actor has no incidents in a country that month, its index is 0.

Severity describes individual incidents only. Only the five republics are scored. Incidents located elsewhere appear on the map and in the feed.

## Updating the data

**Incidents (snapshot).** Rebuild `data/incidents.json` from the sheet with `tools/build_incidents.py` (see the comments at the top of the script). Rows highlighted red (broken link) are left out.

**Incidents (live).** In Google Sheets choose **File → Share → Publish to web**, then the *Incidents - Global* tab and **CSV**. Paste the link into `sheetCsvUrl` in `config.js`. Cell colours aren't included in CSV exports, so add a column named **Hide** and put `TRUE` on any row to keep off the public site.

**Country profiles.** Edit the values in `data/countries.json`. Use `null` for "Not available".

**Reports.** Add entries to `data/reports.json`:

```json
{ "reports": [
  { "title": "Report title", "url": "https://newlinesinstitute.org/...", "date": "Nov 4, 2026", "author": "Author name", "summary": "One or two sentences." }
] }
```

## Putting it on the New Lines website

**Option A: embed (any CMS).**

```html
<iframe id="s7cat" src="https://sdittgennewlines.github.io/s7-central-asia-tracker/?embed=1"
        style="width:100%;border:0;min-height:1400px" title="S7+ Central Asia Geopolitical Tracker"></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "s7cat:height")
      document.getElementById("s7cat").style.height = e.data.height + "px";
  });
</script>
```

`?embed=1` hides the tracker's own header and footer. The script resizes the frame to fit.

**Option B: host it directly.** Copy the folder to the New Lines server, for example `/monitors/s7-central-asia-tracker/`.

## Running locally

ES modules need a web server; opening the file directly won't work.

```
python3 -m http.server 8000
# then open http://localhost:8000
```
