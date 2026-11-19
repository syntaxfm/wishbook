import type { BookContext, BookPage } from "../../lib/book";
import type { Page } from "../../lib/content";

/** How a page renders in this HTML file. */
export interface PageState {
  /** The page this file is opened at. */
  current: boolean;
  /** Visible on first paint: the current page and its spread partner. */
  shown: boolean;
}

/** Props every logical-page template receives. */
export interface TemplateProps {
  /** The physical page: number, side, path. */
  page: BookPage;
  /** The page's content from the book order. */
  content: Page;
  ctx: BookContext;
  state: PageState;
}
