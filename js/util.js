/**
 * util.js: small, dependency-free helpers shared by every component.
 * Nothing here knows about the tracker's data model.
 */

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MON = MONTHS.map((m) => m.slice(0, 3));

/** Escape text for safe insertion into HTML strings. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** "2026-10" -> "October 2026" (or "Oct 2026" when short). */
export function monthLabel(key, short = false) {
  const [y, m] = key.split("-");
  return `${(short ? MON : MONTHS)[+m - 1]} ${y}`;
}

/** "2026-10" -> "Oct". */
export function monthAbbr(key) {
  return MON[+key.slice(5, 7) - 1];
}

/** "2026-10-28" -> "Oct 28, 2026". */
export function fmtDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${MON[+m - 1]} ${+d}, ${y}`;
}

/** 3, "incident" -> "3 incidents". */
export function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Hostname of a URL without "www.", for compact source links. */
export function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Source"; }
}

/** Round an index value for display: one decimal under 10, whole numbers above. */
export function fmtIndex(v) {
  if (v == null) return "–";
  return v > 0 && v < 10 ? v.toFixed(1) : String(Math.round(v));
}

/** Compact money: 306240000000 -> "$306.2 billion". */
export function fmtMoney(v, symbol = "$") {
  if (v == null) return null;
  if (v >= 1e12) return `${symbol}${(v / 1e12).toFixed(2)} trillion`;
  if (v >= 1e9) return `${symbol}${(v / 1e9).toFixed(1)} billion`;
  if (v >= 1e6) return `${symbol}${(v / 1e6).toFixed(1)} million`;
  return `${symbol}${v.toLocaleString("en-US")}`;
}

/** Compact headcount: 20400000 -> "20.4 million". */
export function fmtPeople(v) {
  if (v == null) return null;
  return v >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : v.toLocaleString("en-US");
}

/** Shorthand for document.getElementById. */
export const byId = (id) => document.getElementById(id);
