// @ts-check
import { defineConfig } from "astro/config";
import { SITE_URL } from "./src/lib/urls.ts";

// Keystatic (and the React it needs) is an editing tool for local development
// only. The production build is always plain static files with no admin routes.
const isDev = process.argv.includes("dev");

// The design system showcase is also dev-only: the route is injected only here,
// so the production build never sees it.
/** @type {import("astro").AstroIntegration} */
const showcase = {
  name: "wishbook-design-showcase",
  hooks: {
    "astro:config:setup": ({ injectRoute }) => {
      injectRoute({ pattern: "/dev/design-system", entrypoint: "./src/dev/Showcase.astro" });
    },
  },
};

const devIntegrations = isDev
  ? [
      (await import("@astrojs/react")).default(),
      (await import("@keystatic/astro")).default(),
      showcase,
    ]
  : [];

export default defineConfig({
  site: SITE_URL,
  output: "static",
  // Production URLs always end in "/". Keystatic's admin API calls don't, so dev
  // accepts both.
  trailingSlash: isDev ? "ignore" : "always",
  build: {
    format: "directory",
  },
  integrations: [...devIntegrations],
});
