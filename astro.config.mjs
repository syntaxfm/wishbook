// @ts-check
import { defineConfig } from "astro/config";
import { SITE_URL } from "./src/lib/urls.ts";

// Keystatic (and the React it needs) is an editing tool for local development
// only. The production build is always plain static files with no admin routes.
const isDev = process.argv.includes("dev");

const devIntegrations = isDev
  ? [(await import("@astrojs/react")).default(), (await import("@keystatic/astro")).default()]
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
