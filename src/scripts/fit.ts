/**
 * Fit: in book and single modes every page is the same fixed box (book.css,
 * --pw × --ph), sized from the viewport. A page whose content is taller than
 * its box is scaled down uniformly to fit: the page gets `.is-fit` and
 * `--fit` (the scale), and its content (`.pg`, or the centerfold's `.cf`)
 * shrinks from the top centre. Pages that fit stay at scale 1; nothing is
 * scaled up, clipped, or scrolled.
 *
 * One ResizeObserver watches every page box and its content. It fires after
 * layout and before paint whenever either changes size: a page being shown
 * (display: none → laid out, including a turning leaf), the viewport or the
 * reading mode changing the box, web fonts arriving, images loading. So the
 * scale is always set in the frame the page first paints. Each callback reads
 * every size first, then writes; the writes change only a transform, which
 * never resizes anything, so they can't trigger another round.
 */

const FIT = "is-fit";

/** The part of a page that scales: the page body, or the centerfold. */
function contentOf(box: HTMLElement): HTMLElement | null {
  return box.querySelector<HTMLElement>(":scope > .pg, :scope > .cf");
}

/** The scale that fits a page's content in its box (1 when it already fits). */
function measure(box: HTMLElement, content: HTMLElement): number | null {
  if (!box.getClientRects().length) return null; // not shown
  const cs = getComputedStyle(box);
  const room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  // offsetHeight is the layout height, untouched by the scale or a turn's
  // rotation; it rounds, so allow a pixel.
  const natural = content.offsetHeight + 1;
  if (room <= 0 || natural <= room + 1) return 1;
  return Math.floor((room / natural) * 1000) / 1000;
}

function apply(box: HTMLElement, fit: number): void {
  box.classList.toggle(FIT, fit < 1);
  if (fit < 1) box.style.setProperty("--fit", String(fit));
  else box.style.removeProperty("--fit");
}

/** Fits these pages now (reads all, then writes all). */
export function fitPages(boxes: Iterable<HTMLElement>): void {
  const plan: [HTMLElement, number][] = [];
  for (const box of boxes) {
    const content = contentOf(box);
    const fit = content ? measure(box, content) : null;
    if (fit !== null) plan.push([box, fit]);
  }
  for (const [box, fit] of plan) apply(box, fit);
}

/**
 * Pages narrower than this would switch to the phone reflow (container
 * queries at 520px), which is far taller. A smaller box lays its page out at
 * this width instead and zooms it down (`--dw`, `--pz` on the stage).
 */
const DESIGN_MIN = 540;

function sizeDesign(stage: HTMLElement, on: boolean): void {
  const pw = parseFloat(getComputedStyle(stage).gridTemplateColumns);
  if (on && pw > 0 && pw < DESIGN_MIN) {
    stage.style.setProperty("--dw", `${DESIGN_MIN}px`);
    stage.style.setProperty("--pz", String(pw / DESIGN_MIN));
  } else {
    stage.style.removeProperty("--dw");
    stage.style.removeProperty("--pz");
  }
}

/**
 * Keeps every page fitted while `active()` (book and single modes). In the
 * scroll feed pages keep their natural height and nothing is measured.
 */
export function watchFit(
  stage: HTMLElement,
  boxes: readonly HTMLElement[],
  active: () => boolean,
): void {
  const owner = new Map<Element, HTMLElement>();
  const observer = new ResizeObserver((entries) => {
    const on = active();
    if (entries.some((e) => e.target === stage)) sizeDesign(stage, on);
    if (!on) return;
    const dirty = new Set<HTMLElement>();
    for (const e of entries) {
      const box = owner.get(e.target);
      if (box) dirty.add(box);
    }
    fitPages(dirty);
  });
  observer.observe(stage);
  for (const box of boxes) {
    owner.set(box, box);
    observer.observe(box);
    const content = contentOf(box);
    if (content) {
      owner.set(content, box);
      observer.observe(content);
    }
  }
}
