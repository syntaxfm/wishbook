import { expect, test, type Page } from "@playwright/test";

/**
 * The page turn itself, frame by frame: a turning leaf never adds scrollable
 * overflow (no scrollbar comes and goes), the landed pages don't move when the
 * turn ends, the leaf's shading eases out as it lands, and the leaf turns over
 * the section tabs (which are back on top at rest).
 */

// Real (classic) scrollbars, as on Windows and Linux desktops: one coming and
// going takes its width from the window and shifts the book sideways.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

interface TurnFrame {
  /** A leaf or lift is on the page. */
  turning: boolean;
  scrollW: number;
  scrollH: number;
  /** The vertical scrollbar's width. */
  bar: number;
  /** Shown pages' rects: slug → [x, y, width, height]. */
  rects: Record<string, number[]>;
  /** Opacity of each leaf shade. */
  shades: number[];
  /** A leaf is the topmost element at the inner edge of some tab. */
  leafOverTab: boolean;
  /** A leaf is under the inner edge of some tab, with the tab on top. */
  leafUnderTab: boolean;
}

/**
 * Turns the page with an arrow key and samples every animation frame (with
 * requestAnimationFrame, inside the page) until a few frames after the turn
 * has finished.
 */
async function sampleTurn(page: Page, key: "ArrowRight" | "ArrowLeft"): Promise<TurnFrame[]> {
  return page.evaluate(
    (arrow) =>
      new Promise<TurnFrame[]>((resolve) => {
        const frames: TurnFrame[] = [];
        const tabs = [...document.querySelectorAll(".tabs a")];
        let started = false;
        let after = 0;
        const sample = () => {
          const turning = !!document.querySelector(".leaf, .lift");
          let leafOverTab = false;
          let leafUnderTab = false;
          for (const tab of tabs) {
            const r = tab.getBoundingClientRect();
            // the tab's inner edge, against the book, where a leaf reaches first
            const [x, y] = [r.x + 4, r.y + r.height / 2];
            if (!document.elementsFromPoint(x, y).some((e) => e.closest(".leaf, .lift"))) continue;
            if (document.elementFromPoint(x, y)?.closest(".leaf, .lift")) leafOverTab = true;
            else leafUnderTab = true;
          }
          const shown = [...document.querySelectorAll<HTMLElement>(".book-pages > [data-slug]")];
          frames.push({
            turning,
            scrollW: document.documentElement.scrollWidth,
            scrollH: document.documentElement.scrollHeight,
            bar: innerWidth - document.documentElement.clientWidth,
            rects: Object.fromEntries(
              shown
                .filter((e) => e.getClientRects().length)
                .map((e) => {
                  const r = e.getBoundingClientRect();
                  return [e.dataset.slug!, [r.x, r.y, r.width, r.height]];
                }),
            ),
            shades: [...document.querySelectorAll(".leaf-shade")].map(
              (e) => +getComputedStyle(e).opacity,
            ),
            leafOverTab,
            leafUnderTab,
          });
          if (turning) started = true;
          else if (started) after++;
          if (after > 4 || frames.length > 300) resolve(frames);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: arrow, bubbles: true }));
          sample();
        });
      }),
    key,
  );
}

/** The largest move of any landed page between the turn's last frame and after it. */
function endJump(frames: TurnFrame[]): number {
  const last = frames.findLastIndex((f) => f.turning);
  const end = frames[last]!;
  let jump = 0;
  for (const later of frames.slice(last + 1)) {
    for (const [slug, r] of Object.entries(later.rects)) {
      const before = end.rects[slug];
      if (!before) continue;
      for (let i = 0; i < 4; i++) jump = Math.max(jump, Math.abs(r[i]! - before[i]!));
    }
  }
  return jump;
}

const TURNS = [
  {
    name: "the cover opening",
    width: 1360,
    height: 900,
    path: "/2026/",
    key: "ArrowRight",
    spread: true,
  },
  {
    name: "a spread turning back",
    width: 1360,
    height: 900,
    path: "/2026/favorites/icemag/",
    key: "ArrowLeft",
    spread: true,
  },
  {
    name: "a single page turning",
    width: 1240,
    height: 800,
    path: "/2026/favorites/icemag/",
    key: "ArrowRight",
    spread: false,
  },
] as const;

for (const t of TURNS) {
  test(`${t.name}: no scrollbar, no jump on landing, shading fades out, over the tabs`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto(t.path);
    await expect(page.locator(".book.is-live")).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    const frames = await sampleTurn(page, t.key);
    const turning = frames.filter((f) => f.turning);
    expect(turning.length).toBeGreaterThan(5);

    // The leaf never adds scrollable overflow, so no scrollbar comes and goes.
    const first = frames[0]!;
    for (const f of frames) {
      expect([f.scrollW, f.scrollH, f.bar]).toEqual([first.scrollW, first.scrollH, first.bar]);
    }
    expect(first.bar).toBe(0);

    // The landed pages stay exactly where the turn left them.
    expect(endJump(frames)).toBeLessThan(0.5);

    // The leaf never passes under the tabs. In a spread it swings out over
    // them, and its shading eases out as it lands (nothing left to drop).
    expect(turning.some((f) => f.leafUnderTab)).toBe(false);
    if (t.spread) {
      expect(turning.some((f) => f.leafOverTab)).toBe(true);
      expect(Math.max(...turning.flatMap((f) => f.shades))).toBeGreaterThan(0.5);
      for (const s of turning.at(-1)!.shades) expect(s).toBeLessThan(0.05);
    }

    // At rest the tabs are on top again.
    const onTop = await page
      .locator(".tabs a")
      .first()
      .evaluate((a) => {
        const r = a.getBoundingClientRect();
        return a.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
    expect(onTop).toBe(true);
  });
}
