/**
 * indices.js: the scoring model. Pure functions, no DOM.
 *
 * For a country, an index (RII, CII, USEI or SIRI) and a month:
 *
 *   1. Take the incidents in that country and month that involve the
 *      index's actor (e.g. Russia for RII).
 *   2. Rescale each incident's severity to 0-100: 1 -> 0, 2 -> 33.3,
 *      3 -> 66.7, 4 -> 100. Unrated incidents are skipped. (A rating of 0
 *      is treated as 1.)
 *   3. For each of the 8 sectors, average the rescaled severities of the
 *      incidents tagged with that sector. An incident tagged with several
 *      sectors counts in each. A sector with no incidents scores 0.
 *   4. Each sector contributes 1/8 (12.5%) of the index:
 *        index = sum over sectors of (sector score x 0.125)
 *      so the index runs 0-100 and each sector adds 0-12.5 points.
 *
 * If the actor has no incidents in the country that month, the index is 0.
 *
 * Over a window of several months (e.g. the 3 months ending in September,
 * or all time ending in June), the window score is the AVERAGE of the
 * monthly scores. Months with no incidents count as 0, consistent with the
 * monthly rule. Sector points are averaged the same way, so a window's
 * sector points still add up to its index.
 */

/** The month keys in a window ending at `end`. span: "1" | "3" | "all". */
export function windowMonths(months, end, span) {
  const i = months.indexOf(end);
  if (i < 0) return [];
  const start = span === "all" ? 0 : Math.max(0, i - Number(span) + 1);
  return months.slice(start, i + 1);
}

/** Severity 1-4 -> 0-100. Returns null for unrated incidents. */
export function rescaleSeverity(sev) {
  if (sev == null) return null;
  const clamped = Math.min(4, Math.max(1, sev));
  return ((clamped - 1) / 3) * 100;
}

/**
 * Build a scorer bound to the incident list and configuration, so callers
 * only pass (country, indexKey, month).
 */
export function createScorer(incidents, cfg) {
  const weight = 1 / cfg.sectors.length;
  const actorOf = Object.fromEntries(cfg.indices.map((ix) => [ix.key, ix.actor]));
  const cache = new Map();

  /** Incidents behind one index cell. */
  function incidentsFor(country, indexKey, month) {
    const actor = actorOf[indexKey];
    return incidents.filter((i) => i.location === country && i.date.startsWith(month) && i.actors.includes(actor));
  }

  /**
   * Full index result:
   *   { value, incidents: n, sectors: [{ key, label, score, n, points }] }
   * `score` is the sector's 0-100 average; `points` is its contribution
   * to the index (score x 12.5%).
   */
  function index(country, indexKey, month) {
    const id = `${country}|${indexKey}|${month}`;
    if (cache.has(id)) return cache.get(id);

    const incs = incidentsFor(country, indexKey, month);
    const sectors = cfg.sectors.map((s) => {
      const vals = incs
        .filter((i) => i.types.includes(s.key))
        .map((i) => rescaleSeverity(i.severity))
        .filter((v) => v != null);
      const score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { key: s.key, label: s.label, score, n: vals.length, points: score * weight };
    });
    const result = { value: sectors.reduce((a, s) => a + s.points, 0), incidents: incs.length, sectors };
    cache.set(id, result);
    return result;
  }

  /** Index values across a list of months: [{ month, value, incidents }]. */
  function series(country, indexKey, months) {
    return months.map((m) => {
      const r = index(country, indexKey, m);
      return { month: m, value: r.value, incidents: r.incidents };
    });
  }

  /**
   * Index over a window of months (average of the monthly results).
   * Returns the same shape as index(), plus `months`.
   * Sector `n` and `incidents` are totals across the window.
   */
  function windowIndex(country, indexKey, windowKeys) {
    const monthly = windowKeys.map((m) => index(country, indexKey, m));
    const k = monthly.length || 1;
    const sectors = cfg.sectors.map((s, si) => {
      const cells = monthly.map((r) => r.sectors[si]);
      return {
        key: s.key, label: s.label,
        score: cells.reduce((a, c) => a + c.score, 0) / k,
        points: cells.reduce((a, c) => a + c.points, 0) / k,
        n: cells.reduce((a, c) => a + c.n, 0)
      };
    });
    return {
      value: monthly.reduce((a, r) => a + r.value, 0) / k,
      incidents: monthly.reduce((a, r) => a + r.incidents, 0),
      sectors,
      months: windowKeys
    };
  }

  return { index, series, windowIndex, incidentsFor };
}
