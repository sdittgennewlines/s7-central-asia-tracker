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
 */

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

  return { index, series, incidentsFor };
}
