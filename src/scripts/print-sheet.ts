/**
 * Fills the printed order form (src/components/PrintSheet.astro) with a list,
 * and the shared total helper the on-page order form uses too.
 */
import { formatPrice } from "../lib/catalog";
import { indexItem, shareUrl, type IndexItem } from "./wishlist-store";

export interface Total {
  /** "361.74", or "" for an empty list. */
  text: string;
  /** Some listed price is an estimate. */
  estimated: boolean;
  /** Some listed item has no price. */
  unpriced: boolean;
}

export function totalOf(list: readonly IndexItem[]): Total {
  let cents = 0;
  let priced = 0;
  for (const item of list) {
    if (item.p === undefined) continue;
    cents += Math.round(item.p * 100);
    priced++;
  }
  return {
    text: priced ? formatPrice(cents / 100) : "",
    estimated: list.some((i) => i.p !== undefined && i.e === 1),
    unpriced: list.some((i) => i.p === undefined),
  };
}

/** Writes a total into a cell: "361.74" + "est." marker + "*" for unpriced items. */
export function renderTotal(target: HTMLElement, total: Total): void {
  target.replaceChildren(total.text);
  if (total.text && total.estimated) target.append(estMark());
  if (total.unpriced) target.append("*");
}

const BLANK_ROWS = 6;

function cell(tag: "td" | "th", text = "", className = ""): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

export function fillPrintSheet(ids: readonly number[]): void {
  const sheet = document.querySelector<HTMLElement>("[data-print-sheet]");
  if (!sheet) return;
  const list = ids.map(indexItem).filter((i): i is IndexItem => !!i);
  const body = sheet.querySelector("[data-print-rows]")!;
  const rows = list.map((item) => {
    const tr = document.createElement("tr");
    const name = cell("td", item.n);
    if (item.u) {
      const url = document.createElement("div");
      url.className = "ps-buy";
      url.textContent = item.u;
      name.append(url);
    }
    const price = cell("td", item.p !== undefined ? formatPrice(item.p) : (item.x ?? ""));
    if (item.e === 1) price.append(estMark());
    tr.append(cell("td", item.c ?? "", "mono"), name, cell("td", "1"), price);
    return tr;
  });
  for (let i = rows.length; i < BLANK_ROWS; i++) {
    const tr = document.createElement("tr");
    tr.className = "blank";
    tr.append(cell("td"), cell("td"), cell("td"), cell("td"));
    rows.push(tr);
  }
  body.replaceChildren(...rows);

  const total = totalOf(list);
  renderTotal(sheet.querySelector<HTMLElement>("[data-print-total]")!, total);
  const note = sheet.querySelector<HTMLElement>("[data-print-unpriced]");
  if (note) note.hidden = !total.unpriced;
  const url = sheet.querySelector<HTMLElement>("[data-print-url]");
  if (url) url.textContent = list.length ? shareUrl(sheet.dataset.sharePath ?? "", ids) : "";
}

function estMark(): HTMLElement {
  const est = document.createElement("span");
  est.className = "est";
  est.textContent = "est.";
  return est;
}
