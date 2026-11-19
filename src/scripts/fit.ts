/**
 * Fit: in book and single modes every page is the same fixed box (book.css,
 * --pw × --ph), sized from the viewport. Every page is designed to fit that
 * box at full scale (tests/e2e/page-fit.spec.ts); this is the safety net. A
 * page whose content is still taller than its box is scaled down uniformly to
 * fit (with a console warning in dev): the page gets `.is-fit` and
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

interface Fit {
  scale: number;
  /** How far the unscaled content runs past the box, in px. */
  over: number;
}

/** The scale that fits a page's content in its box (1 when it already fits). */
function measure(box: HTMLElement, content: HTMLElement): Fit | null {
  if (!box.getClientRects().length) return null; // not shown
  const cs = getComputedStyle(box);
  const room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  // offsetHeight is the layout height, untouched by the scale or a turn's
  // rotation; it rounds (and a page that fills its box rounds up from a
  // fractional room), so allow a pixel.
  const natural = content.offsetHeight;
  if (room <= 0 || natural <= room + 1) return { scale: 1, over: 0 };
  return { scale: Math.floor((room / natural) * 1000) / 1000, over: natural - room };
}

/**
 * The scale is a transform, which leaves the content's layout box full
 * height; `--fit-over` pulls it back (a negative bottom margin) so the box
 * has no hidden overflow to scroll to.
 */
function apply(box: HTMLElement, fit: Fit): void {
  // Every page is designed to fit its box at full scale (the page-fit e2e
  // test checks it); scaling is only a safety net, so say so in dev.
  if (
    import.meta.env.DEV &&
    fit.scale < 1 &&
    box.style.getPropertyValue("--fit") !== String(fit.scale)
  ) {
    console.warn(
      `[fit] page "${box.dataset.slug}" is ${Math.round(fit.over)}px taller than its box; scaled to ${fit.scale}`,
    );
  }
  box.classList.toggle(FIT, fit.scale < 1);
  if (fit.scale < 1) {
    box.style.setProperty("--fit", String(fit.scale));
    box.style.setProperty("--fit-over", `${fit.over}px`);
  } else {
    box.style.removeProperty("--fit");
    box.style.removeProperty("--fit-over");
  }
}

/** Fits these pages now (reads all, then writes all). */
export function fitPages(boxes: Iterable<HTMLElement>): void {
  const plan: [HTMLElement, Fit][] = [];
  for (const box of boxes) {
    const content = contentOf(box);
    const fit = content ? measure(box, content) : null;
    if (fit) plan.push([box, fit]);
  }
  for (const [box, fit] of plan) apply(box, fit);
}

/**
 * Pages narrower than this would switch to the phone reflow (container
 * queries at 520px of content box; a framed page like the holly border has
 * about 7% less), which is far taller. A smaller box lays its page out at
 * this width instead and zooms it down (`--dw`, `--pz` on the stage).
 */
const DESIGN_MIN = 560;

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
