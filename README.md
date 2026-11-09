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
  state.js                 the shared state store (selected country, filters, time window)
  filters.js               incident filters shared by the map and the feed
  data.js                  loading the data files
  indices.js               the scoring model, monthly and over time windows (pure functions)
  scales.js                colour scales shared by every component
  exportDialog.js          the "Download" pop-up (CSV / Excel / PNG), same as the GFP platform
  download.js              saving files to the reader's computer (shared with the GFP)
  export/pngCharts.js      the image versions of the charts, with the copyright frame
  lib/xlsx.js, lib/zip.js  Excel writer, no dependencies (shared with the GFP)
  tooltip.js               the one floating tooltip
  util.js                  formatting helpers
  components/
    map.js                 one bubble per country, ringed by sector; pins for other places
    feed.js                incident feed + the filters (sector chips, actor, period, search)
    countrySummary.js      selected country's name, leader and key facts
    breakdown.js           "How <country>'s indices add up" for 1 month / 3 months / all time
    indexTable.js          the four indices for all five countries (shown when no country is selected)
    indexChart.js          RII / CII / USEI / SIRI month by month
    reports.js             links to analyst reports
data/
  incidents.json           incidents, rebuilt nightly from the sheet
  update-report.json       last night's update: counts, held-back rows and why
  countries.json           country profiles (labels and sources defined once under "fields")
  region.geo.json          country borders (Natural Earth, public domain), cropped to the region
  reports.json             report links
assets/new-lines-logo.png
tools/update_data.py       nightly sheet -> incidents.json update, with all the checks
tools/stamp.mjs            run before pushing code changes (see "Changing the code")
tools/clip_geo.py          one-off: crop the map borders
.github/workflows/         the nightly schedule
```

### How the code fits together

1. `main.js` loads the data and creates a **store** (`state.js`) holding what's selected.
2. Each component in `js/components/` is created with a shared `ctx` (config, incidents, scorer, store) and returns `{ render(state) }`.
3. When the user clicks something, the component calls `store.set({...})`. Every component's `render` then runs with the new state.
4. Components never call each other. To add one, create `js/components/<name>.js` and add it to the list in `main.js`.

### Changing the code

After editing any file in `js/`, `config.js` or `css/`, run **`node tools/stamp.mjs`** before pushing. It adds a fingerprint to every file's address in `index.html`, so browsers fetch the new version of each changed file instead of mixing old and new copies right after an update. That mix-up once blanked the GFP platform.

If it is forgotten, nothing breaks outright: each component starts in isolation, and a "couldn't start" message replaces a blank page.

The nightly data update doesn't need it, because the data is always fetched fresh.

## Downloads

The line chart and the "How ___ adds up" block each have a **Download** button. It opens the same pop-up as the GFP platform:
- **CSV**: the data only.
- **Excel**: the data with the title above and the copyright below.
- **PNG**: the chart redrawn in a standard frame with "© 2026 The New Lines Institute".

What each one contains:
- **Line chart:** all four indices for every month in view. The PNG shows only the indices toggled on.
- **"How ___ adds up", with a country selected:** points and incident counts per sector and index, plus the index score, for the chosen window.
- **The same block with no country selected:** the four indices and incident counts for the five countries.

The copyright and credit lines are set in `config.js`.

## How the indices are calculated

Each index is computed per country, per actor, per month. The code is in `js/indices.js`.

1. Take that country's incidents for the month (including incidents listing several countries) that involve the index's actor: Russia for RII, China for CII, the U.S. for USEI, S7+ states for SIRI.
2. Rescale each incident's severity (1–4) to 0–100: 1 → 0, 2 → 33, 3 → 67, 4 → 100.
3. Average the rescaled severities within each of the 8 sectors. A sector with no incidents scores **0**. An incident tagged with several sectors counts in each.
4. Each sector contributes **12.5%**, so `index = Σ (sector score × 0.125)`, on a 0–100 scale.
5. If an actor has no incidents in a country that month, its index is 0.
6. Over several months (e.g. 3 months ending in September, or all time ending in June), the score is the **average of the monthly scores**. Months with no incidents count as 0.
7. **Only completed months are scored on the page.** The current month (New York time) is still collecting incidents, so its indices would be artificially low. Its incidents show in the feed and on the map right away; its indices appear once the month ends.

On the map, each country's bubble shows how many incidents pass the feed's filters. The ring around it splits those incidents by sector, and an incident tagged with several sectors counts in each. Severity describes individual incidents only. Only the five republics are scored. Incidents located elsewhere appear on the map and in the feed.

## Updating the data

### Incidents: automatic, every night just after midnight (New York)

`.github/workflows/nightly-data.yml` checks every hour and, the first time each day (New York date) it finds the day's update hasn't happened yet, runs `tools/update_data.py`. GitHub's scheduled runs can start hours late, so the job doesn't depend on a punctual midnight run; normally the update lands within an hour after midnight. The script downloads the **Incidents - Global** tab of the Google Sheet, checks it and republishes the site. Analysts just keep editing the sheet.

**Row checks.** A row is held back (and the rest still publish) if it has:
- an invalid or future date
- no Central Asian country in Location
- a sector not among the eight, or no sector
- a severity other than 1–4
- no actor ticked
- no title
- a link that isn't a single web address

Held-back rows and the reasons are listed in [`data/update-report.json`](data/update-report.json). They are expected, so they don't send an alert. Fix the row and it appears the next night.

**Hide a row.** Tick the **Hide** checkbox (column P) to keep an incident off the site, e.g. while checking a broken link.

**Multi-country incidents.** Select several countries in Location. The incident appears under each country and counts toward each country's indices. Places other than the five countries are ignored (noted in the report).

**Stopping the whole update.** Nothing is published, and the site keeps yesterday's data, if:
- the download fails
- the sheet stops being viewable by link
- a column header is renamed or removed
- fewer than 60% of rows pass
- valid incidents drop by more than 10% overnight

The job then fails and alerts the owner. It opens an issue labelled `data-update-failed`, assigned to `sdittgennewlines`, which GitHub emails to that account. A stopped update retries every hour, but the alert is updated (and emailed) at most once a day. The issue closes itself after the next successful run.

**Direct email alerts (optional).** To email `sdittgen@newlinesinstitute.org` directly as well, add these repository secrets (Settings → Secrets and variables → Actions): `MAIL_SERVER`, `MAIL_PORT` (usually 587), `MAIL_USERNAME` and `MAIL_PASSWORD`. Use an account that can send mail, e.g. a Microsoft 365 or Gmail account with an app password.

**Run it now.** Go to Actions → Nightly data update → Run workflow. To check the sheet without publishing: `python3 tools/update_data.py --dry-run`.

**Don't rename these header columns:** Date & Time, Type, Severity, Location, Russia, China, USA, S7, Title, Description, Link (and Hide). Other columns are ignored.

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
