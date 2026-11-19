// @ts-check
import { defineConfig } from "astro/config";
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { parseEditions } from "./src/lib/editions-core.ts";
import { redirectsFile } from "./src/lib/redirects.ts";
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

/** @param {string} path a project-relative file */
const readProjectFile = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Writes dist/_redirects from the current edition's sections, so year-less
// section links always match the book.
/** @type {import("astro").AstroIntegration} */
const redirects = {
  name: "wishbook-redirects",
  hooks: {
    // The build has already validated the content, so plain YAML reads are safe here.
    "astro:build:done": async ({ dir }) => {
      const { current } = parseEditions(await readProjectFile("./content/editions.yaml"));
      /** @type {{ sections: { id: string }[] }} */
      const { sections } = parseYaml(await readProjectFile(`./content/${current}/sections.yaml`));
      await writeFile(
        new URL("_redirects", dir),
        redirectsFile(
          current,
          sections.map((s) => s.id),
        ),
      );
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
  image: {
    // The brand logo is an SVG with an embedded texture (~870 KB), so it ships as
    // resized rasters. Every image is a local, checked-in asset.
    dangerouslyProcessSVG: true,
  },
  integrations: [...devIntegrations, redirects],
});
