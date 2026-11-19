import type { APIRoute, GetStaticPaths } from "astro";
import { getEditions } from "../../../lib/content";
import { listOgCards, renderOgCard, type OgCard } from "../../../lib/og";

/** One share card per page, plus wishlist.png and default.png, for every edition. */
export const getStaticPaths = (async () => {
  const paths = [];
  for (const edition of getEditions()) {
    for (const card of await listOgCards(edition)) {
      paths.push({ params: { edition: String(edition), slug: card.slug }, props: { card } });
    }
  }
  return paths;
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ card: OgCard }> = async ({ props }) => {
  const png = await renderOgCard(props.card);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
