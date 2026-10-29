/**
 * state.js: the single source of truth for what the page is showing.
 *
 * Components never talk to each other directly. They read the state, and
 * when the user does something they call store.set(...). Every subscriber
 * (each component's render function) then runs with the new state.
 *
 * State shape:
 *   country   selected scored country ("Kazakhstan"), or null for the
 *             regional overview (the default on first load)
 *   filters   incident filters shared by the map and the feed
 *             (see filters.js): { sectors, actor, period, search, location }
 *   window    the breakdown's time window: { end: "2026-09", span: "1"|"3"|"all" }
 *   range     time span of the line chart: "3" | "6" | "all" (months)
 *   indices   index keys drawn on the line chart, e.g. ["RII", "CII"]
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

    /** Register a function to run after every change. */
    subscribe(fn) {
      listeners.push(fn);
    }
  };
}
