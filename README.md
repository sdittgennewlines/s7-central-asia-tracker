# S7+ Central Asia Tracker

A static web page for the Central Asia Center (New Lines Institute). It shows a severity map, charts and an incident feed built from the "S7 + CAT Monitor" Google Sheet.

It has no server, database or build step. Any static host can serve it, including GitHub Pages, Netlify and the New Lines web server.

## Files

| File | What it is |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Styles, all scoped under `.s7cat` so they don't leak into a host page |
| `app.js` | Scoring, map, charts and feed. Plain JavaScript with no libraries |
| `config.js` | **The only file to edit**: data sources, scored countries, sectors, actor colours |
| `data/incidents.json` | Snapshot of the "Incidents - Global" tab |
| `data/region.geo.json` | Country borders (Natural Earth, public domain), cropped to the region |
| `data/reports.json` | Links to analyst reports on the New Lines site |

## Publish on GitHub Pages (free)

1. Create a **public** repository, for example `s7-central-asia-tracker`, and upload these files to it.
2. In the repository, open **Settings → Pages**, set *Source* to "Deploy from a branch", choose `main` and `/ (root)`, then save.
3. After a minute the site is live at `https://<your-username>.github.io/s7-central-asia-tracker/`.

## Keep the data live

Right now the page reads the snapshot in `data/incidents.json`. To have it read the Google Sheet directly:

1. In the sheet, choose **File → Share → Publish to web**. Select the *Incidents - Global* tab and *Comma-separated values (.csv)*, then publish.
2. Paste the link into `sheetCsvUrl` in `config.js`.

Cell colours are lost in CSV export, so the red "broken link" highlight can't be read. Add a column named **Hide** and enter `TRUE` for any row that should stay off the public site.

## Add a report

Add an entry to `data/reports.json`:

```json
{ "reports": [
  { "title": "Report title", "url": "https://newlinesinstitute.org/...", "date": "Nov 4, 2026", "author": "Author name", "summary": "One or two sentences." }
] }
```

## Put it on the New Lines website

**Option A: embed (works on any CMS).** Paste this where the tracker should appear:

```html
<iframe id="s7cat" src="https://<host>/s7-central-asia-tracker/?embed=1"
        style="width:100%;border:0;min-height:1200px" title="S7+ Central Asia Tracker"></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "s7cat:height")
      document.getElementById("s7cat").style.height = e.data.height + "px";
  });
</script>
```

`?embed=1` hides the tracker's own New Lines header and footer, so the host page's header is used instead. The small script resizes the frame to fit its content.

**Option B: host it directly.** Copy the folder to the New Lines server, for example `newlinesinstitute.org/monitors/s7-central-asia-tracker/`. Nothing else is needed.

## Scoring (summary)

- Each incident's severity (1–4) is rescaled to 0–100: 1→0, 2→33, 3→67, 4→100.
- For a country and month, ratings are averaged within each of the 8 sectors. An incident tagged with several sectors counts toward each one.
- The country score is the simple average of its sector scores, so each sector has equal weight. Sectors with no incidents that month are left out.
- An actor's score uses only incidents that actor is involved in.
- Only the five Central Asian republics are scored. Incidents located elsewhere appear on the map and in the feed only.
- The regional figure is the average of the five country scores.
