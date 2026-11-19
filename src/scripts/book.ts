/**
 * The book engine. Takes over the server-rendered book (Book.astro) and turns
 * it into an instant, flippable catalog with real URLs:
 *
 *   book    ≥ 1000px  the current spread, with a 3D page turn
 *   single  ≥ 640px   one page, the old page lifts away
 *   scroll  below     every page in a vertical feed; the URL follows reading
 *
 * Every page is already in the document, so turns and jumps never touch the
 * network: they only change which pages show and update the address.
 *
 * History: a turn (prev/next, arrow keys, swipe, scrolling the feed) replaces
 * the URL; a jump (tab, cross-reference, hotspot, search result, navigate())
 * pushes it. Back and forward are handled with popstate. Landing on the bare
 * "/" and then turning or jumping moves the address into the edition
 * (/2026/…), since every page's path is year-scoped.
 *
 * After every turn or jump the new page is announced in a polite live region
 * ("<title>, <section>") and focus moves to its heading. Reduced motion swaps
 * pages instantly.
 *
 * Events (on document):
 *   wishbook:navigate  detail: { slug, path, kind, mode }   after each page change
 *   wishbook:mode      detail: { mode }                     when the reading mode changes
 */
import { MODE_CLASS, modeFor, type ReadingMode } from "../lib/modes";
import { RouteTable } from "../lib/routes";
import { buildSpreads, spreadPages, type Spread } from "../lib/spreads";
import { linkCenterfolds } from "./centerfold";
import { watchFit } from "./fit";

/** How a page change happened. */
export type NavKind = "init" | "turn" | "jump" | "pop" | "scroll" | "mode";

export interface NavDetail {
  slug: string;
  path: string;
  kind: NavKind;
  mode: ReadingMode;
}

interface PageInfo {
  el: HTMLElement;
  slug: string;
  n: number;
  end: number;
  index: number;
  path: string;
  section: string;
  sectionName: string;
  title: string;
  docTitle: string;
  label: string;
}

/** The book turn, as in the page-turn design. */
const BOOK_TURN_MS = 750;
const SINGLE_TURN_MS = 600;
const FADE_MS = 450;
const SWIPE_PX = 50;

let root: HTMLElement | null = null;
let stage: HTMLElement;
let pages: PageInfo[] = [];
let spreads: Spread<PageInfo>[] = [];
let routes: RouteTable;
let current: PageInfo;
let mode: ReadingMode;
let live: HTMLElement | null;
/** Finishes the running animation at once (a jump or popstate mid-turn). */
let settle: (() => void) | null = null;
let feedObserver: IntersectionObserver | null = null;
/** While the feed scrolls to a jump target, reading position doesn't move the URL. */
let feedHoldUntil = 0;
/** The page edges that turn (book and single modes). */
let edges: HTMLButtonElement[] = [];
/** Picks the reading mode for a viewport; replaceable with setModeResolver(). */
let resolveMode = (width: number, _height: number): ReadingMode => modeFor(width);

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const bySlug = (slug: string) => pages.find((p) => p.slug === slug);

/* ---------- public API ---------- */

/**
 * Opens a page of this book by slug. A jump by default: the URL is pushed, so
 * Back returns to where the reader was. Pass `{ push: false }` to replace it.
 * Returns false for a slug that isn't in this book.
 */
export function navigate(slug: string, { push = true }: { push?: boolean } = {}): boolean {
  const page = root ? bySlug(slug) : undefined;
  if (!page) return false;
  settle?.();
  go(page, push ? "jump" : "turn", { push });
  return true;
}

/** Turns one spread (book mode) or one page (single and scroll modes). */
export function turn(dir: 1 | -1): void {
  if (!root) return;
  if (mode === "book") turnBook(dir);
  else if (mode === "single") turnSingle(dir);
  else {
    const next = pages[current.index + dir];
    if (next) go(next, "turn", { push: false });
  }
}

/** The open page, or null before the engine starts. */
export function currentPage(): {
  slug: string;
  path: string;
  title: string;
  section: string;
} | null {
  if (!root) return null;
  const { slug, path, title, section } = current;
  return { slug, path, title, section };
}

export function currentMode(): ReadingMode | null {
  return root ? mode : null;
}

/** The year-scoped path of a page of this book, or null. */
export function pathOf(slug: string): string | null {
  return root ? routes.pathOf(slug) : null;
}

/**
 * Replaces how the reading mode is chosen from the viewport (by default, by
 * width alone: modeFor). Re-evaluates the mode at once if the engine runs.
 */
export function setModeResolver(fn: (width: number, height: number) => ReadingMode): void {
  resolveMode = fn;
  if (root) setMode(fn(innerWidth, innerHeight));
}

/* ---------- start ---------- */

export function start(): void {
  if (root) return;
  root = document.querySelector<HTMLElement>(".book");
  if (!root) return;
  stage = root.querySelector<HTMLElement>(".book-pages")!;
  live = root.querySelector<HTMLElement>("[data-live]");

  pages = [...stage.querySelectorAll<HTMLElement>(":scope > [data-slug]")].map((el, index) => {
    const d = el.dataset;
    const n = Number(d.n);
    return {
      el,
      slug: d.slug!,
      n,
      end: Number(d.end ?? n),
      index,
      path: d.path!,
      section: d.section ?? "",
      sectionName: d.sectionName ?? "",
      title: d.title ?? "",
      docTitle: d.docTitle ?? document.title,
      label: d.label ?? "",
    };
  });
  spreads = buildSpreads(pages);
  routes = new RouteTable(pages, root.dataset.rootSlug || null);
  current =
    bySlug(routes.slugFor(location.pathname) ?? "") ??
    bySlug(root.dataset.current ?? "") ??
    pages[0]!;

  insertSectionHeads();
  convertPager();
  history.scrollRestoration = "manual";
  history.replaceState({ slug: current.slug }, "", location.href);

  edges = [...stage.querySelectorAll<HTMLButtonElement>(":scope > .edge")];
  mode = resolveMode(innerWidth, innerHeight);
  applyModeClass();
  render();
  if (mode === "scroll") enterFeed();

  watchFit(
    stage,
    pages.map((p) => p.el),
    () => mode !== "scroll",
  );
  observeReveals();
  linkCenterfolds(stage);
  bindInput();
  emit("init");
}

function emit(kind: NavKind): void {
  document.dispatchEvent(
    new CustomEvent<NavDetail>("wishbook:navigate", {
      detail: { slug: current.slug, path: current.path, kind, mode },
    }),
  );
}

/* ---------- state & rendering ---------- */

function spreadIndexOf(page: PageInfo): number {
  return Math.max(
    0,
    spreads.findIndex((s) => s.left === page || s.right === page),
  );
}

/** Pages to show for the current page: its spread in book mode, else just it. */
function shownPages(page: PageInfo): PageInfo[] {
  return spreadPages(spreads[spreadIndexOf(page)]!);
}

/** Shows `current` (and its spread partner), with tabs, pager, title, and images to match. */
function render(): void {
  const shown = new Set(shownPages(current));
  for (const p of pages) {
    p.el.classList.toggle("is-current", p === current);
    p.el.classList.toggle("is-shown", shown.has(p));
  }
  document.title = current.docTitle;
  updateTabs();
  updatePager();
  updateEdges();
  primeImages();
}

/** Opens a page: the single path every turn, jump, and popstate goes through. */
function go(
  page: PageInfo,
  kind: NavKind,
  { push = false, focus = true }: { push?: boolean; focus?: boolean } = {},
): void {
  current = page;
  const url = page.path;
  if (kind !== "pop" && normalizeHere() !== url) {
    if (push) history.pushState({ slug: page.slug }, "", url);
    else history.replaceState({ slug: page.slug }, "", url);
  }
  render();
  if (kind === "scroll") return emit(kind);
  if (mode === "scroll") scrollFeedTo(page, true);
  else keepBookInView();
  announce(page);
  if (focus) focusHeading(page);
  emit(kind);
}

function normalizeHere(): string {
  return routes.pathOf(routes.slugFor(location.pathname) ?? "") ?? location.pathname;
}

function announce(page: PageInfo): void {
  if (!live) return;
  live.textContent = page.sectionName ? `${page.title}, ${page.sectionName}` : page.title;
}

function focusHeading(page: PageInfo): void {
  const heading = page.el.querySelector<HTMLElement>(".page-title");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

/** After a turn or jump in book/single mode, bring the top of the book back into view. */
function keepBookInView(): void {
  const top = stage.getBoundingClientRect().top;
  if (top < 0) {
    scrollTo({ top: Math.max(0, top + scrollY - 12), behavior: "instant" });
  }
}

function updateTabs(): void {
  for (const tab of root!.querySelectorAll<HTMLAnchorElement>(".tabs a[data-section]")) {
    const on = tab.dataset.section === current.section;
    tab.classList.toggle("on", on);
    if (on) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  }
}

/* ---------- prev / next ---------- */

/** The server renders a disabled end of the pager as a span; make both ends links. */
function convertPager(): void {
  for (const end of root!.querySelectorAll<HTMLElement>(".pager > .prev, .pager > .next")) {
    if (end.tagName === "A") continue;
    const a = document.createElement("a");
    a.className = end.className;
    a.innerHTML = end.innerHTML;
    a.rel = end.classList.contains("prev") ? "prev" : "next";
    end.replaceWith(a);
  }
}

/** The page a prev/next press opens in the current mode, or null at either end. */
function neighbour(dir: 1 | -1): PageInfo | null {
  if (mode === "book") {
    const s = spreads[spreadIndexOf(current) + dir];
    return s ? (s.left ?? s.right) : null;
  }
  return pages[current.index + dir] ?? null;
}

function updatePager(): void {
  const where = root!.querySelector(".pager .where");
  if (where) {
    where.textContent = `${current.end > current.n ? "Pages" : "Page"} ${current.label}`;
  }
  for (const [cls, dir] of [
    ["prev", -1],
    ["next", 1],
  ] as const) {
    const a = root!.querySelector<HTMLAnchorElement>(`.pager > a.${cls}`);
    if (!a) continue;
    const target = neighbour(dir);
    if (target) {
      a.href = target.path;
      a.removeAttribute("aria-disabled");
    } else {
      a.removeAttribute("href");
      a.setAttribute("aria-disabled", "true");
    }
  }
}

/** An edge shows only when there is a page to turn to that way. */
function updateEdges(): void {
  for (const edge of edges) edge.hidden = !neighbour(edge.dataset.turn === "-1" ? -1 : 1);
}

/**
 * A click on a page edge turns, like the pager. If a control on the page sits
 * under the strip, the click goes to it instead.
 */
function onEdgeClick(e: MouseEvent): void {
  const edge = e.currentTarget as HTMLButtonElement;
  if (e.detail > 0) {
    const under = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el) => !edges.includes(el as HTMLButtonElement) && stage.contains(el));
    const control = under?.closest<HTMLElement>(
      "a[href], button, input, select, textarea, label, summary",
    );
    if (control && stage.contains(control)) {
      control.click();
      return;
    }
  }
  turn(edge.dataset.turn === "-1" ? -1 : 1);
}

/* ---------- book mode: the 3D leaf ---------- */

function turnBook(dir: 1 | -1): void {
  if (settle) return;
  const i = spreadIndexOf(current);
  const from = spreads[i];
  const to = spreads[i + dir];
  if (!from || !to) return;
  const target = (to.left ?? to.right)!;
  const finish = () => go(target, "turn");

  // The leaf carries the turning page (front) and the page on its back (rear);
  // underneath, the spread shows what the turn will reveal.
  const front = dir > 0 ? from.right : from.left;
  const rear = dir > 0 ? to.left : to.right;
  const wide = [from.left, from.right, to.left, to.right].some((p) => p && p.end > p.n);
  if (reducedMotion() || !front || !rear) return finish();
  if (wide) return fadeTo(target, "turn");

  const under = (dir > 0 ? [from.left, to.right] : [to.left, from.right]).filter(
    (p): p is PageInfo => !!p,
  );
  for (const p of pages) p.el.classList.toggle("is-shown", under.includes(p));
  const faces = [
    { page: front, cls: "leaf-front", from: 0, to: dir > 0 ? -180 : 180 },
    { page: rear, cls: "leaf-rear", from: dir > 0 ? 180 : -180, to: 0 },
  ];
  for (const f of faces) {
    f.page.el.classList.add("leaf", f.cls);
    f.page.el.style.transform = `rotateY(${f.from}deg)`;
    const shade = document.createElement("div");
    shade.className = "leaf-shade";
    shade.setAttribute("aria-hidden", "true");
    f.page.el.append(shade);
  }
  animate(
    faces.map((f) => f.page.el),
    () => {
      for (const f of faces) f.page.el.style.transform = `rotateY(${f.to}deg)`;
    },
    BOOK_TURN_MS,
    () => {
      for (const f of faces) {
        f.page.el.classList.remove("leaf", f.cls);
        f.page.el.style.transform = "";
        f.page.el.querySelector(":scope > .leaf-shade")?.remove();
      }
      finish();
    },
  );
}

/* ---------- single mode: the page lifts away ---------- */

function turnSingle(dir: 1 | -1): void {
  if (settle) return;
  const target = pages[current.index + dir];
  if (!target) return;
  const finish = () => go(target, "turn");
  if (reducedMotion()) return finish();

  // Forward: the current page lifts off to reveal the next one underneath.
  // Back: the previous page swings back in on top.
  const leaf = dir > 0 ? current : target;
  const under = dir > 0 ? target : current;
  under.el.classList.add("under");
  leaf.el.classList.add("lift");
  if (dir < 0) leaf.el.classList.add("lifted");
  animate(
    [leaf.el],
    () => leaf.el.classList.toggle("lifted", dir > 0),
    SINGLE_TURN_MS,
    () => {
      under.el.classList.remove("under");
      leaf.el.classList.remove("lift", "lifted");
      finish();
    },
  );
}

/** The simpler transition into or out of the centerfold: a quick fade. */
function fadeTo(target: PageInfo, kind: NavKind): void {
  go(target, kind);
  const els = shownPages(target).map((p) => p.el);
  for (const el of els) el.classList.add("fade-in");
  animate(
    els,
    () => {},
    FADE_MS,
    () => {
      for (const el of els) el.classList.remove("fade-in");
    },
  );
}

/**
 * Runs a CSS transition: `.turning` turns transitions on, `change` sets the end
 * state two frames later (so the start state paints first), and `done` runs on
 * transitionend, on a timeout fallback, or when settled early.
 */
function animate(els: HTMLElement[], change: () => void, ms: number, done: () => void): void {
  const first = els[0];
  if (!first) return done();
  const listeners = new AbortController();
  let finished = false;
  const end = () => {
    if (finished) return;
    finished = true;
    settle = null;
    listeners.abort();
    clearTimeout(timer);
    for (const el of els) el.classList.remove("turning");
    done();
  };
  const onEnd = (e: Event) => {
    if (e.target === first) end();
  };
  first.addEventListener("transitionend", onEnd, { signal: listeners.signal });
  first.addEventListener("animationend", onEnd, { signal: listeners.signal });
  const timer = window.setTimeout(end, ms + 250);
  settle = end;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (finished) return;
      for (const el of els) el.classList.add("turning");
      change();
    }),
  );
}

/* ---------- scroll mode: the feed ---------- */

/** A small section head before each section's first page, shown only in the feed. */
function insertSectionHeads(): void {
  let last: string | null = null;
  for (const p of pages) {
    if (p.section === last) continue;
    last = p.section;
    if (!p.sectionName) continue;
    const head = document.createElement("div");
    head.className = "sec-h";
    head.setAttribute("aria-hidden", "true");
    head.textContent = p.sectionName;
    p.el.before(head);
  }
}

function enterFeed(): void {
  feedObserver?.disconnect();
  scrollFeedTo(current, false);
  feedObserver = new IntersectionObserver(
    (entries) => {
      if (Date.now() < feedHoldUntil) return;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const page = bySlug((e.target as HTMLElement).dataset.slug ?? "");
        if (page && page !== current) go(page, "scroll");
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  for (const p of pages) feedObserver.observe(p.el);
}

function leaveFeed(): void {
  feedObserver?.disconnect();
  feedObserver = null;
}

function scrollFeedTo(page: PageInfo, flash: boolean): void {
  const smooth = flash && !reducedMotion();
  feedHoldUntil = Date.now() + (smooth ? 1500 : 200);
  const top = page.el.getBoundingClientRect().top + scrollY - 12;
  scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
  if (smooth) {
    addEventListener("scrollend", () => (feedHoldUntil = Date.now() + 100), { once: true });
  }
  if (flash) {
    page.el.classList.remove("flash");
    void page.el.offsetWidth;
    page.el.classList.add("flash");
  }
}

/* ---------- modes ---------- */

function applyModeClass(): void {
  const cl = document.documentElement.classList;
  for (const m of Object.values(MODE_CLASS)) cl.remove(m);
  cl.add("js", MODE_CLASS[mode]);
}

function setMode(next: ReadingMode): void {
  if (next === mode) return;
  settle?.();
  if (mode === "scroll") leaveFeed();
  mode = next;
  applyModeClass();
  render();
  if (mode === "scroll") enterFeed();
  else keepBookInView();
  document.dispatchEvent(new CustomEvent("wishbook:mode", { detail: { mode } }));
}

/* ---------- images ---------- */

/**
 * Pages hidden in the book never come near the viewport, so native lazy
 * loading would only start fetching once a page is turned to. Load the
 * current spread and its neighbours eagerly instead; everything else stays
 * lazy.
 */
function primeImages(): void {
  const near: PageInfo[] = [];
  if (mode === "book") {
    const i = spreadIndexOf(current);
    for (const s of spreads.slice(Math.max(0, i - 1), i + 2)) near.push(...spreadPages(s));
  } else {
    near.push(...pages.slice(Math.max(0, current.index - 1), current.index + 2));
  }
  for (const p of near) {
    for (const img of p.el.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
      img.loading = "eager";
    }
  }
}

/* ---------- reveal ---------- */

/** Pages get `.in` once, the first time they come into view (pops, pulses, marker draws). */
function observeReveals(): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
  );
  for (const p of pages) if (!p.el.classList.contains("in")) io.observe(p.el);
}

/* ---------- input & routing ---------- */

function bindInput(): void {
  addEventListener("popstate", () => {
    settle?.();
    const slug = routes.slugFor(location.pathname);
    const page = slug ? bySlug(slug) : undefined;
    // Never another edition or a non-book URL: let the browser load it.
    if (!page) return location.reload();
    go(page, "pop");
  });

  // In-book links (tabs, cross-references, hotspots, the index) open without a
  // reload. The pager turns instead of jumping.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(a instanceof HTMLAnchorElement)) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    if (a.origin !== location.origin) return;
    const slug = routes.slugFor(a.pathname);
    const page = slug ? bySlug(slug) : undefined;
    if (!page) return;
    e.preventDefault();
    if (a.closest(".pager")) {
      turn(a.classList.contains("prev") ? -1 : 1);
      return;
    }
    settle?.();
    go(page, "jump", { push: true });
  });

  addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (
      t instanceof Element &&
      t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
    ) {
      return;
    }
    if (mode === "scroll") return;
    e.preventDefault();
    turn(e.key === "ArrowRight" ? 1 : -1);
  });

  // Swipe to turn (book and single modes). The centerfold's strip scrolls instead.
  let x0: number | null = null;
  let y0 = 0;
  stage.addEventListener("pointerdown", (e) => {
    const strip = e.target instanceof Element ? e.target.closest(".cf-scroll") : null;
    x0 = strip && strip.scrollWidth > strip.clientWidth ? null : e.clientX;
    y0 = e.clientY;
  });
  stage.addEventListener("pointerup", (e) => {
    if (x0 === null || mode === "scroll") return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? 1 : -1);
  });

  for (const edge of edges) edge.addEventListener("click", onEdgeClick);

  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => setMode(resolveMode(innerWidth, innerHeight)), 150);
  });
}
