import type { APIRoute } from "astro";
import { getCurrentEdition, getGlobal } from "../lib/content";
import { webManifest } from "../lib/icons";
import { editionUrl } from "../lib/urls";

/** /site.webmanifest: the name, colours, and home-screen icons. */
export const GET: APIRoute = async () => {
  const { name } = await getGlobal();
  const manifest = webManifest(name, editionUrl(getCurrentEdition()));
  return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
    headers: { "Content-Type": "application/manifest+json" },
  });
};
