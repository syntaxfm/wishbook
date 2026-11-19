/**
 * PROTOTYPE: the client half of the layout variants (see
 * src/lib/proto-layout.ts): the switcher panel, the mode choice per layout,
 * the magnifier and zoomed page (c), the auto-hiding controls (d), and the
 * hybrid tiers (src/scripts/proto-hybrid.ts).
 */
import type { ReadingMode } from "../lib/modes";
import {
  LAYOUT_KEY,
  LAYOUT_NAMES,
  LAYOUTS,
  DEFAULT_LAYOUT,
  chromeFor,
  layoutMode,
  parseLayout,
  type Layout,
} from "../lib/proto-layout";
import { currentMode, currentPage, navigate, setModeResolver } from "./book";
import { clearMeasurements, decide, mountPanel } from "./proto-hybrid";

const html = document.documentElement;
let layout: Layout = parseLayout(html.dataset.layout) ?? DEFAULT_LAYOUT;

/**
 * The mode for this layout at a viewport size (hybrid measures the book).
 * Sets the frame too, before the engine applies the mode, so the new mode's
 * first layout (and the feed's height reservation) already uses it.
 */
function resolve(w: number, h: number): ReadingMode {
  const mode = layout === "hybrid" ? decide(w, h).mode : layoutMode(layout, w, h);
  if (layout !== "hybrid") delete html.dataset.hyTier;
  html.dataset.chrome = chromeFor(layout, mode);
  return mode;
}

/** Call before the engine starts, so it opens in the layout's mode. */
export function installLayouts(): void {
  setModeResolver(resolve);
}

/** Call after the engine starts. */
export function startLayouts(): void {
  renderSwitcher();
  startZoom();
  startIdle();
  // Heights measured with fallback fonts are wrong: measure again once the
  // web fonts are in.
  if (document.fonts.status !== "loaded") {
    void document.fonts.ready.then(() => {
      clearMeasurements();
      if (layout === "hybrid") setModeResolver(resolve);
    });
  }
}

function setLayout(next: Layout): void {
  if (next === layout) return;
  layout = next;
  html.dataset.layout = next;
  try {
    localStorage.setItem(LAYOUT_KEY, next);
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
  closeZoom();
  setModeResolver(resolve);
  updateSwitcher();
  updateMagnifiers();
  // Keep the reader on their page when the feed's shape changes.
  requestAnimationFrame(() => {
    if (currentMode() !== "scroll") return;
    const slug = currentPage()?.slug;
    document
      .querySelector(`.book-pages > [data-slug="${slug}"]`)
      ?.scrollIntoView({ behavior: "instant" });
  });
}

/* ---------- switcher ---------- */

let switcher: HTMLElement | null = null;

function renderSwitcher(): void {
  switcher = document.createElement("div");
  switcher.className = "proto-switch";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Prototype layout");
  const label = document.createElement("b");
  label.textContent = "Layout";
  switcher.append(label);
  for (const l of LAYOUTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = l === "hybrid" ? "H" : l.toUpperCase();
    b.title = LAYOUT_NAMES[l];
    b.dataset.layout = l;
    b.addEventListener("click", () => setLayout(l));
    switcher.append(b);
  }
  const name = document.createElement("span");
  name.className = "name";
  switcher.append(name);
  // hybrid: why this tier, and the floor / max-screens knobs
  mountPanel(switcher, () => {
    if (layout === "hybrid") setModeResolver(resolve);
  });
  document.body.append(switcher);
  updateSwitcher();
}

function updateSwitcher(): void {
  if (!switcher) return;
  for (const b of switcher.querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.layout === layout));
  }
  switcher.querySelector(".name")!.textContent = LAYOUT_NAMES[layout];
}

/* ---------- c: magnifier and zoomed page ---------- */

const MAG_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';

let mags: HTMLButtonElement[] = [];
let zoomed: { el: HTMLElement; mark: Comment; overlay: HTMLElement } | null = null;
/** Every page, in book order (captured before any page moves into the zoom). */
let order: HTMLElement[] = [];

const zoomActive = () => layout === "c" && currentMode() !== "scroll";

/** The pages the magnifiers open: the left and right page on screen. */
function shownBySide(): { left?: HTMLElement; right?: HTMLElement } {
  const out: { left?: HTMLElement; right?: HTMLElement } = {};
  for (const el of document.querySelectorAll<HTMLElement>(".book-pages > .is-shown")) {
    if (el.classList.contains("cf-page")) continue;
    if (currentMode() === "single") out.right = el;
    else if (el.classList.contains("left")) out.left = el;
    else out.right = el;
  }
  return out;
}

function startZoom(): void {
  const book = document.querySelector<HTMLElement>(".book");
  const stage = document.querySelector<HTMLElement>(".book-pages");
  if (!book || !stage) return;
  order = [...stage.querySelectorAll<HTMLElement>(":scope > [data-slug]")];
  for (const side of ["left", "right"] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `proto-mag proto-mag-${side}`;
    b.dataset.side = side;
    b.innerHTML = MAG_ICON;
    b.addEventListener("click", () => {
      const el = shownBySide()[side];
      if (el) openZoom(el);
    });
    book.append(b);
    mags.push(b);
  }
  // A click on a page (not on a link or control, and not a swipe) zooms it too.
  let down: { x: number; y: number } | null = null;
  stage.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  stage.addEventListener("click", (e) => {
    if (!zoomActive() || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    const t = e.target instanceof Element ? e.target : null;
    if (moved || !t || t.closest("a, button, input, select, textarea, label, summary")) return;
    const page = t.closest<HTMLElement>(".book-pages > .is-shown");
    if (page) openZoom(page);
  });
  document.addEventListener("wishbook:navigate", updateMagnifiers);
  document.addEventListener("wishbook:mode", () => {
    if (!zoomActive()) closeZoom();
    updateMagnifiers();
  });
  addEventListener("resize", () => zoomed && sizeZoom(zoomed.overlay));
  // While zoomed, arrows step page by page and Escape closes.
  addEventListener(
    "keydown",
    (e) => {
      if (!zoomed) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeZoom();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopImmediatePropagation();
        stepZoom(e.key === "ArrowRight" ? 1 : -1);
      }
    },
    { capture: true },
  );
  updateMagnifiers();
}

function updateMagnifiers(): void {
  const shown = shownBySide();
  for (const b of mags) {
    const el = shown[b.dataset.side as "left" | "right"];
    b.hidden = !zoomActive() || !el;
    b.setAttribute("aria-label", el ? `Zoom in on ${el.dataset.title ?? "this page"}` : "Zoom in");
  }
}

function sizeZoom(overlay: HTMLElement): void {
  const frame = overlay.querySelector<HTMLElement>(".proto-zoom-frame")!;
  const wide = frame.firstElementChild?.classList.contains("cf-page");
  const design = wide ? 1240 : 620;
  frame.style.width = `${design}px`;
  frame.style.zoom = String(Math.min(innerWidth - 120, wide ? 1600 : 1100) / design);
}

function openZoom(el: HTMLElement): void {
  if (zoomed) closeZoom();
  const mark = document.createComment("zoomed page");
  el.replaceWith(mark);
  const overlay = document.createElement("div");
  overlay.className = "proto-zoom";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${el.dataset.title ?? "Page"}, zoomed`);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "proto-zoom-close";
  close.textContent = "Close ✕";
  close.addEventListener("click", closeZoom);
  const frame = document.createElement("div");
  frame.className = "proto-zoom-frame";
  frame.append(el);
  overlay.append(close, frame);
  // A click on the dark backdrop closes.
  overlay.addEventListener("click", (e) => e.target === overlay && closeZoom());
  document.body.append(overlay);
  html.classList.add("proto-zoomed");
  sizeZoom(overlay);
  zoomed = { el, mark, overlay };
  close.focus();
}

function closeZoom(): void {
  if (!zoomed) return;
  const { el, mark, overlay } = zoomed;
  zoomed = null;
  mark.replaceWith(el);
  overlay.remove();
  html.classList.remove("proto-zoomed");
}

/** Zoomed: open the next or previous page in book order, staying zoomed. */
function stepZoom(dir: 1 | -1): void {
  if (!zoomed) return;
  const next = order[order.indexOf(zoomed.el) + dir];
  if (!next?.dataset.slug) return;
  closeZoom();
  navigate(next.dataset.slug, { push: false });
  openZoom(next);
}

/* ---------- d: controls fade while the mouse rests ---------- */

function startIdle(): void {
  let timer = 0;
  const wake = () => {
    html.classList.remove("proto-idle");
    clearTimeout(timer);
    timer = window.setTimeout(() => html.classList.add("proto-idle"), 2500);
  };
  for (const type of ["pointermove", "pointerdown", "keydown", "focusin", "wheel"]) {
    addEventListener(type, wake, { passive: true });
  }
  wake();
}
