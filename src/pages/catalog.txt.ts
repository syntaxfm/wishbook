import type { APIRoute } from "astro";
import { getBookContext } from "../lib/book";
import { catalogTextResponse } from "../lib/catalog-txt";
import { getCurrentEdition } from "../lib/content";

/** Root copy of the current edition's catalog, so `curl …/catalog.txt` needs no redirect. */
export const GET: APIRoute = async () =>
  catalogTextResponse(await getBookContext(getCurrentEdition()));
