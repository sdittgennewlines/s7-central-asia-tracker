/**
 * Toolbar: the country picker and month navigator above the dashboard.
 *
 * Reads:  state.country, state.month
 * Writes: country, month
 * DOM:    #countrySelect, #monthSelect, #prevMonth, #nextMonth
 */
import { byId, monthLabel, esc } from "../util.js";

export function createToolbar(ctx) {
  const { cfg, months, store } = ctx;
  const countrySel = byId("countrySelect");
  const monthSel = byId("monthSelect");
  const prev = byId("prevMonth");
  const next = byId("nextMonth");

  // Options are built once; render() only syncs the selected values.
  countrySel.innerHTML = cfg.scoredCountries.map((c) => `<option>${esc(c)}</option>`).join("");
  monthSel.innerHTML = [...months].reverse().map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");

  countrySel.addEventListener("change", () => store.set({ country: countrySel.value, highlight: null }));
  monthSel.addEventListener("change", () => store.set({ month: monthSel.value, highlight: null }));
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  /** Move the selected month by `dir` (-1 earlier, +1 later). */
  function step(dir) {
    const i = months.indexOf(store.get().month) + dir;
    if (i >= 0 && i < months.length) store.set({ month: months[i], highlight: null });
  }

  return {
    render(state) {
      countrySel.value = state.country;
      monthSel.value = state.month;
      const i = months.indexOf(state.month);
      prev.disabled = i <= 0;
      next.disabled = i >= months.length - 1;
    }
  };
}
