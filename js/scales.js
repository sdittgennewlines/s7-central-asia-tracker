/**
 * scales.js: colour scales shared across components, so the same value
 * always gets the same colour everywhere on the page.
 */

/**
 * Light-blue sequential steps for index values (0-100). The steps are
 * finer at the low end because most monthly index values fall below 40.
 * `dark: true` means the step needs white text on top.
 */
export const INDEX_STEPS = [
  { max: 0, color: "#F3F7FB", label: "0", dark: false },
  { max: 10, color: "#DCEBFA", label: "Under 10", dark: false },
  { max: 20, color: "#B7D3F6", label: "10–19", dark: false },
  { max: 30, color: "#86B6EF", label: "20–29", dark: false },
  { max: 40, color: "#5598E7", label: "30–39", dark: true },
  { max: Infinity, color: "#2A6FC4", label: "40 and above", dark: true }
];

/** The step for an index value. Values are compared on the displayed (rounded) number. */
export function indexStep(value) {
  const v = Math.round((value || 0) * 10) / 10;
  if (v <= 0) return INDEX_STEPS[0];
  return INDEX_STEPS.find((s, i) => i > 0 && v < s.max) || INDEX_STEPS[INDEX_STEPS.length - 1];
}

/** Colour for a severity level (1-4) from the config; unrated -> neutral grey. */
export function severityColor(cfg, sev) {
  if (sev == null) return "#C9C6CE";
  return cfg.severityLevels[Math.min(4, Math.max(1, sev))].color;
}
