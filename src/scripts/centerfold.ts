/**
 * Centerfold: the legend and the hotspots light each other. Hovering or
 * focusing a legend entry lights its hotspot (and scrolls the swipe strip to
 * it when the art is wider than the screen); hovering or focusing a hotspot
 * lights its legend entry.
 *
 * Legend entries are links to each item's page. While the strip scrolls
 * (small screens), the first tap on an entry selects it (lights the hotspot
 * and scrolls the strip there); a second tap on the selected entry follows the
 * link.
 */
export function linkCenterfolds(scope: ParentNode): void {
  for (const cf of scope.querySelectorAll<HTMLElement>(".cf")) linkCenterfold(cf);
}

// Touch taps also fire mouse and focus events before the click: only a real
// mouse hover or keyboard focus lights an entry ahead of its click.
const hover = (e: PointerEvent) => e.pointerType === "mouse";
const keyboard = (el: HTMLElement) => el.matches(":focus-visible");

function linkCenterfold(cf: HTMLElement): void {
  const strip = cf.querySelector<HTMLElement>(".cf-scroll");
  const hots = [...cf.querySelectorAll<HTMLElement>(".hot[data-i]")];
  const entries = [...cf.querySelectorAll<HTMLElement>(".cf-legend [data-i]")];
  const legend = cf.querySelector<HTMLElement>(".cf-legend");
  let lit: string | null = null;
  const scrolls = () => !!strip && strip.scrollWidth > strip.clientWidth + 1;

  const light = (i: string | null, scrollStrip: boolean) => {
    lit = i;
    for (const el of [...hots, ...entries]) el.classList.toggle("lit", el.dataset.i === i);
    const hot = hots.find((h) => h.dataset.i === i);
    if (hot && strip && scrollStrip && scrolls()) {
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      strip.scrollTo({
        left: hot.offsetLeft - strip.clientWidth / 2,
        behavior: smooth ? "smooth" : "instant",
      });
    }
  };

  for (const entry of entries) {
    const i = entry.dataset.i ?? null;
    entry.addEventListener("pointerenter", (e) => hover(e) && light(i, true));
    entry.addEventListener("focus", () => keyboard(entry) && light(i, true));
    entry.addEventListener("click", (e) => {
      if (scrolls() && lit !== i) {
        e.preventDefault();
        light(i, true);
      }
    });
  }
  legend?.addEventListener("pointerleave", (e) => hover(e) && light(null, false));

  for (const hot of hots) {
    const i = hot.dataset.i ?? null;
    hot.addEventListener("pointerenter", (e) => hover(e) && light(i, false));
    hot.addEventListener("focus", () => light(i, false));
    hot.addEventListener("pointerleave", (e) => hover(e) && light(null, false));
    hot.addEventListener("blur", () => light(null, false));
  }
}
