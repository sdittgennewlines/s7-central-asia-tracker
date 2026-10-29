/**
 * tooltip.js: one shared floating tooltip for the map, charts and table.
 *
 * Usage:  tooltip.show(htmlString, mouseEvent);  tooltip.hide();
 * The tooltip element (#tooltip) lives in index.html.
 */

const el = document.getElementById("tooltip");

/** Show `html` near the pointer, kept inside the viewport. */
export function show(html, ev) {
  el.innerHTML = html;
  el.hidden = false;
  const box = el.getBoundingClientRect();
  let x = ev.clientX + 14;
  let y = ev.clientY + 14;
  if (x + box.width > window.innerWidth - 8) x = ev.clientX - box.width - 14;
  if (y + box.height > window.innerHeight - 8) y = ev.clientY - box.height - 14;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}

/** Hide the tooltip. */
export function hide() {
  el.hidden = true;
}

/** Attach show/hide handlers to an element; `html` is a function returning the content. */
export function bind(target, html) {
  target.addEventListener("mousemove", (ev) => show(html(ev), ev));
  target.addEventListener("mouseleave", hide);
}
