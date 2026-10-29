/**
 * state.js: the single source of truth for what the page is showing.
 *
 * Components never talk to each other directly. They read the state, and
 * when the user does something they call store.set(...). Every subscriber
 * (each component's render function) then runs with the new state.
 *
 * State shape:
 *   country     selected scored country, e.g. "Kazakhstan"
 *   month       selected month key, e.g. "2026-10" (drives map, table, breakdown, feed)
 *   range       time span of the index chart: "3" | "6" | "all" (months)
 *   indices     index keys shown on the chart and breakdown, e.g. ["RII","CII"]
 *   highlight   row id of the incident the user picked on the map, or null
 *   feed        incident-feed filters:
 *                 actor     "all" or an actor key (Russia, China, USA, S7)
 *                 sector    "all" or a sector key
 *                 allMonths true = ignore the selected month
 *                 location  null = selected country; otherwise a non-scored
 *                           location picked from a map pin (e.g. "Russia")
 *                 search    free-text filter
 *                 shown     how many feed items are rendered
 */

export function createStore(initial) {
  let state = initial;
  const listeners = [];

  return {
    /** Current state (treat as read-only). */
    get: () => state,

    /** Shallow-merge a patch into state, then notify every listener. */
    set(patch) {
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state));
    },

    /** Merge a patch into state.feed (convenience for the feed filters). */
    setFeed(patch) {
      this.set({ feed: { ...state.feed, ...patch } });
    },

    /** Register a function to run after every change. */
    subscribe(fn) {
      listeners.push(fn);
    }
  };
}
