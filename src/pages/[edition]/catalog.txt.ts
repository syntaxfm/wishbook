import type { APIRoute, GetStaticPaths } from "astro";
import { getBookContext } from "../../lib/book";
import { catalogTextResponse } from "../../lib/catalog-txt";
import { getEditions } from "../../lib/content";

/** The plain-text catalog for every edition: /2026/catalog.txt. */
export const getStaticPaths = (() =>
  getEditions().map((edition) => ({
    params: { edition: String(edition) },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) =>
  catalogTextResponse(await getBookContext(params.edition!));
