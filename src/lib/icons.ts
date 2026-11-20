/**
 * The site icons (the grouse, made by `pnpm icons` into public/) and the web
 * app manifest. They are site-wide root files, like /_astro/ assets, not
 * edition content, so their URLs carry no year.
 */
import { rootUrl } from "./urls";

/** Wish red: the browser's theme colour. */
export const THEME_COLOR = "#c5301f";
/** Cream paper: the manifest's splash background. */
export const BACKGROUND_COLOR = "#f1e2c4";

export const ICONS = {
  ico: rootUrl("favicon.ico"),
  png32: rootUrl("favicon-32.png"),
  apple: rootUrl("apple-touch-icon.png"),
  manifest: rootUrl("site.webmanifest"),
} as const;

/** site.webmanifest for the WishBook, opening at the current edition's cover. */
export function webManifest(name: string, startUrl: string) {
  return {
    name,
    short_name: "WishBook",
    start_url: startUrl,
    display: "browser",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: [192, 512].map((size) => ({
      src: rootUrl(`icon-${size}.png`),
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
  };
}
