/**
 * main.js: entry point. Loads the data, builds the shared context, creates
 * every component and re-renders them whenever the state changes.
 *
 * Page anatomy (see index.html):
 *
 *   ┌──────────────────────────────┬──────────────────┐
 *   │ Map (bubbles + sector rings) │ Incident feed    │  same height
 *   ├──────────────────────────────┼──────────────────┤
 *   │ Country summary              │ Index line chart │
 *   │ "How ___ adds up" breakdown  │                  │
 *   └──────────────────────────────┴──────────────────┘
 *   Reports, Methodology
 *
 * To add a component: create js/components/<name>.js exporting
 * create<Name>(ctx) that returns { render(state) }, then add it to the
 * `components` list below.
 */
import { CONFIG } from "../config.js";
import { loadIncidents, loadJSON, monthsIn } from "./data.js";
import { createScorer } from "./indices.js";
import { createStore } from "./state.js";
import { byId, fmtDate } from "./util.js";
import { createMap } from "./components/map.js";
import { createCountrySummary } from "./components/countrySummary.js";
import { createIndexChart } from "./components/indexChart.js";
import { createBreakdown } from "./components/breakdown.js";
import { createFeed } from "./components/feed.js";
import { renderReports } from "./components/reports.js";

const root = document.querySelector(".s7cat");

// Embedded mode (?embed=1 or #embed) hides the tracker's own header and
// footer, for use inside an iframe on the New Lines site.
if (/(^|[?&])embed=1/.test(location.search) || location.hash === "#embed") root.classList.add("is-embed");

/** Tell a parent page (iframe host) how tall the tracker is. */
function postHeight() {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: "s7cat:height", height: document.documentElement.scrollHeight }, "*"); } catch { /* ignore */ }
}

async function start() {
  // 1. Load everything in parallel. Optional files fail soft.
  const [inc, geo, profiles, reports] = await Promise.all([
    loadIncidents(CONFIG),
    loadJSON(CONFIG.geoUrl).catch(() => null),
    loadJSON(CONFIG.countriesUrl).catch(() => null),
    loadJSON(CONFIG.reportsUrl).catch(() => ({ reports: [] }))
  ]);

  // 2. Shared context handed to every component.
  const months = monthsIn(inc.incidents);
  const store = createStore({
    country: CONFIG.defaultCountry,
    filters: { sectors: [], actor: "all", period: "all", search: "", location: null },
    window: { end: months[months.length - 1], span: "1" },
    range: "all",
    indices: CONFIG.indices.map((ix) => ix.key)
  });
  const ctx = { cfg: CONFIG, incidents: inc.incidents, months, geo, profiles, store, scorer: createScorer(inc.incidents, CONFIG) };

  // 3. Components. Order doesn't matter; each owns its own DOM.
  const components = [createMap, createFeed, createCountrySummary, createBreakdown, createIndexChart].map((make) => make(ctx));
  const renderAll = (state) => { components.forEach((c) => c.render(state)); postHeight(); };
  store.subscribe(renderAll);

  // 4. Static sections.
  renderReports(reports.reports || []);
  const dates = inc.incidents.map((i) => i.date).sort();
  byId("dataNote").textContent =
    `Data: ${inc.incidents.length} incidents, ${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}. ` +
    (inc.live ? "Loaded live from the Central Asia Center's incident sheet." : `Snapshot of the Central Asia Center's incident sheet${inc.generated ? `, taken ${fmtDate(inc.generated)}` : ""}.`) +
    " Incidents with unverified source links are held back until checked.";

  renderAll(store.get());
  if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
}

start().catch((err) => {
  console.error(err);
  byId("trackerError").hidden = false;
});
