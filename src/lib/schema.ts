import { collection, config, fields, singleton } from "@keystatic/core";

/**
 * The content schema: every editable field, for one edition. Used by the
 * Keystatic admin (keystatic.config.ts, always the current edition) and by the
 * build-time reader (src/lib/content.ts, any edition).
 *
 * This module runs in the browser too (the admin), so it must not use Node APIs.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTIONAL_SLUG = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const OPTIONAL_HEX = /^(?:#[0-9a-fA-F]{6})?$/;
/** mm:ss or h:mm:ss, or empty while the video isn't cut yet. */
export const TIMESTAMP_RE = /^(?:\d+:[0-5]\d:[0-5]\d|\d{1,3}:[0-5]\d)$/;
const OPTIONAL_TIMESTAMP = /^(?:\d+:[0-5]\d:[0-5]\d|\d{1,3}:[0-5]\d)?$/;
/** Photo suffixes for item images: main photo (empty), extras, and item art. */
export const PHOTO_SUFFIX_RE = /^(?:[2-9]|hero)$/;
const OPTIONAL_PHOTO_SUFFIX = /^(?:[2-9]|hero)?$/;
/** Most photos a full-page feature's collage lays out on its stage. */
export const MAX_COLLAGE = 6;

const COPY_HINT =
  "Copy markup: **bold**, *italic*, {page:slug} for a page reference, {syn:item-slug} for a catalog number, {count}, {catalog}.";

export const TEMPLATES = [
  { value: "cover", label: "Front cover" },
  { value: "welcome", label: "Welcome: how to shop, video, key" },
  { value: "shoppers", label: "Meet your shoppers + contents" },
  { value: "divider", label: "Section divider" },
  { value: "grid", label: "Grid of photo cards" },
  { value: "feature", label: "Full-page feature" },
  { value: "holly", label: "Holly two-up" },
  { value: "under", label: "Under $… page" },
  { value: "brand-column", label: "Brand column" },
  { value: "lineup", label: "Lineup bands" },
  { value: "brand-feature", label: "Brand feature (variants side by side)" },
  { value: "actual-size", label: "Shown at actual size" },
  { value: "price-tags", label: "Price tags" },
  { value: "house-brand", label: "House brand" },
  { value: "centerfold", label: "Centerfold" },
  { value: "wild", label: "Two-up with quotes on photos" },
  { value: "luxury", label: "Luxury feature" },
  { value: "odds-ends", label: "Odds & ends" },
  { value: "index", label: "Index of every gift" },
  { value: "order-form", label: "Order form" },
  { value: "back-cover", label: "Back cover" },
] as const;

export type Template = (typeof TEMPLATES)[number]["value"];

/**
 * The most items each layout can show and still fit its fixed page box (the
 * content reader fails the build past these). Layouts that show no items have
 * a cap of 0. A holly page with up to two items is the two-up; three to six
 * make its grid. Two items or fewer on a grid, holly, or under page make a
 * "duo" page with bigger photos.
 */
export const ITEM_CAPS: Record<Template, number> = {
  cover: 0,
  welcome: 0,
  shoppers: 0,
  divider: 0,
  grid: 4,
  feature: 1,
  holly: 6,
  under: 4,
  "brand-column": 2,
  lineup: 3,
  "brand-feature": 1,
  "actual-size": 2,
  "price-tags": 6,
  "house-brand": 1,
  centerfold: 0,
  wild: 2,
  luxury: 1,
  "odds-ends": 8,
  index: 0,
  "order-form": 0,
  "back-cover": 0,
};

export const PAGE_VARIANTS = [
  { value: "default", label: "Default" },
  { value: "mirrored", label: "Mirrored (brand column: photos on the left)" },
  { value: "bench", label: "Workbench stage (feature: for products shot on white)" },
] as const;

export type PageVariant = (typeof PAGE_VARIANTS)[number]["value"];

export const QUOTE_PLACEMENTS = [
  { value: "below", label: "Below the photo (default)" },
  { value: "on", label: "On the photo (large photos only)" },
  { value: "bubble", label: "Speech bubble (page quotes)" },
  { value: "oneliner", label: "One-liner (page quotes)" },
] as const;

export type QuotePlacement = (typeof QUOTE_PLACEMENTS)[number]["value"];

export const KEY_SYMBOLS = [
  { value: "letter", label: "Item letter" },
  { value: "catalog", label: "Catalog number" },
  { value: "new", label: "NEW banner" },
  { value: "picked", label: "Picked-by sticker" },
  { value: "estimate", label: "Estimated price" },
] as const;

export type KeySymbol = (typeof KEY_SYMBOLS)[number]["value"];

export const PHOTO_BACKGROUNDS = [
  { value: "light", label: "Light (photo has its own background)" },
  { value: "dark", label: "Dark frame (transparent product cut-outs)" },
] as const;

export type PhotoBackground = (typeof PHOTO_BACKGROUNDS)[number]["value"];

export const ORDER_LINE_LINKS = [
  { value: "", label: "No link" },
  { value: "video", label: "The episode video (falls back while its URL is empty)" },
] as const;

export type OrderLineLink = (typeof ORDER_LINE_LINKS)[number]["value"];

const optionalText = (label: string, description?: string) => fields.text({ label, description });

const copyText = (label: string, description?: string) =>
  fields.text({ label, description: description ? `${description} ${COPY_HINT}` : COPY_HINT });

const copyArea = (label: string, description?: string) =>
  fields.text({
    label,
    multiline: true,
    description: description ? `${description} ${COPY_HINT}` : COPY_HINT,
  });

const assetKey = (label: string, description: string) =>
  fields.text({
    label,
    description,
    validation: {
      pattern: { regex: /^[A-Za-z0-9:-]*$/, message: "Use an asset key from the assets manifest" },
    },
  });

const quote = (defaultPlacement: QuotePlacement) =>
  fields.object(
    {
      text: fields.text({
        label: "Quote",
        multiline: true,
        description: 'From the episode transcript. Use "…" to trim.',
        validation: { isRequired: true },
      }),
      by: fields.relationship({
        label: "Said by",
        collection: "hosts",
        description: "Leave empty for a group (then fill in Attribution).",
      }),
      byLabel: optionalText("Attribution", 'Overrides the host name, e.g. "the crew".'),
      context: optionalText("Context", 'Added after the name, e.g. "on the UV light".'),
      verify: fields.checkbox({
        label: "Needs verification (⚠)",
        description: "Keep checked until the quote is checked against the transcript.",
      }),
      placement: fields.select({
        label: "Placement",
        options: QUOTE_PLACEMENTS,
        defaultValue: defaultPlacement,
      }),
    },
    { label: "Quote" },
  );

const quoteLabel = (props: { fields: { text: { value: string } } }) =>
  props.fields.text.value.slice(0, 60) || "Quote";

const price = (label: string, description: string) =>
  fields.number({ label, description, step: 0.01, validation: { min: 0 } });

const editionPaths = (edition: number) => ({
  items: `content/${edition}/items/*` as const,
  hosts: `content/${edition}/hosts/*` as const,
  site: `content/${edition}/site`,
  sections: `content/${edition}/sections`,
  book: `content/${edition}/book`,
  timestamps: `content/${edition}/timestamps`,
  assets: `content/${edition}/assets`,
});

/** The Keystatic config for one edition. Paths are content/<edition>/…; global is shared. */
export function createKeystaticConfig(edition: number) {
  const paths = editionPaths(edition);

  const items = collection({
    label: `Items (${edition})`,
    slugField: "name",
    path: paths.items,
    format: { data: "yaml" },
    columns: ["id"],
    schema: {
      name: fields.slug({
        name: { label: "Name", description: "Full item name, e.g. SHARGE ICEMAG 3." },
        slug: {
          label: "Slug",
          description: "The file name and the reference used by pages and timestamps.",
        },
      }),
      id: fields.integer({
        label: "Item id",
        description:
          "Permanent and unique in this edition. Never reuse one. Used in image file names (assets/<year>/items/<id>-<name>.<ext>, zero-padded to 3 digits) and wish-list links.",
        validation: { isRequired: true, min: 1 },
      }),
      shortName: optionalText(
        "Short name",
        'Used where a shorter name reads better: "The ICEMAG 3".',
      ),
      indexName: optionalText(
        "Index name",
        'How it sorts in the index: "Power bank, SHARGE". Defaults to the name.',
      ),
      brand: optionalText("Brand"),
      section: fields.text({
        label: "Section",
        description: "Section id from Sections, e.g. favorites.",
        validation: { isRequired: true, pattern: { regex: SLUG, message: "Use a section id" } },
      }),
      pickedBy: fields.multiRelationship({ label: "Picked by", collection: "hosts" }),
      isNew: fields.checkbox({ label: "NEW", description: "Shows the NEW banner." }),
      mention: fields.checkbox({
        label: "Mentioned in passing",
        description:
          "Not a real pick, just mentioned (stocking stuffers, odds and ends). Not counted in the number of gifts.",
      }),
      priceConfirmed: price("Price (confirmed)", "Shown as is when set."),
      priceEstimate: price(
        "Price (estimate)",
        'Shown with an "est." marker when there is no confirmed price.',
      ),
      priceLabel: optionalText(
        "Price label",
        'Shown instead of a number when there is no price: "TBA", "Price upon request".',
      ),
      priceNote: optionalText("Price note", 'Context for the price: "on sale, reg. 79.90".'),
      unit: fields.text({
        label: "Unit",
        description: 'Order-line unit: "Each", "Pair", "Kit".',
        defaultValue: "Each",
      }),
      buyLink: fields.url({
        label: "Buy link",
        description:
          "Where to buy: the item's link from the episode description. The only link the site shows for it.",
      }),
      linkLabel: optionalText(
        "Link label",
        "Replaces the site's buy label for this item's link (\"View\" for a link that isn't a store). Empty: the buy label.",
      ),
      affiliate: fields.checkbox({
        label: "Affiliate or store link",
        description:
          'Marks the link rel="sponsored". Untick for a link that isn\'t a store or an affiliate link (a post, a video).',
        defaultValue: true,
      }),
      noLink: fields.checkbox({
        label: "No purchase link: this item is never sold online",
        description:
          "No link is coming, so `pnpm links` doesn't list it as missing. Renders like any item without a buy link: no link anywhere. Leave the buy link empty.",
      }),
      sources: fields.array(fields.url({ label: "Source" }), {
        label: "Sources",
        description: "Research and reference only. Never shown.",
        itemLabel: (props) => props.value ?? "Source",
      }),
      headline: copyText("Friendly headline", 'Short catalog title: "Lean On Me."'),
      description: copyArea(
        "Description",
        "Follows the item name in the copy. Separate paragraphs with a blank line.",
      ),
      altDescriptions: fields.array(copyArea("Alternative description"), {
        label: "Alternative descriptions",
        itemLabel: (props) => props.value.slice(0, 60) || "Description",
      }),
      features: fields.array(
        fields.object({
          lead: fields.text({ label: "Bold lead-in", validation: { isRequired: true } }),
          text: copyText("Text"),
        }),
        {
          label: "Feature lead-ins",
          description: "Running copy with bold lead-ins on full-page features.",
          itemLabel: (props) => props.fields.lead.value || "Feature",
        },
      ),
      specs: optionalText("Specs line", 'Short spec summary: "2× USB-C, 1× USB-A".'),
      alsoIn: fields.array(fields.text({ label: "Option" }), {
        label: "Also in",
        description: 'Chips under the copy: "Game Boy shape", "horizontal".',
        itemLabel: (props) => props.value || "Option",
      }),
      variants: fields.array(
        fields.object({
          key: fields.text({
            label: "Key",
            description: "Short id, unique within this item. Timestamps refer to it.",
            validation: { isRequired: true, pattern: { regex: SLUG, message: "Use a-z, 0-9, -" } },
          }),
          name: fields.text({ label: "Name", validation: { isRequired: true } }),
          features: copyArea("Features"),
          price: price("Price", "Leave empty to use the price label."),
          priceLabel: optionalText("Price label", '"TBA", "Someday".'),
          unit: optionalText("Unit", 'Order-line unit, e.g. "Kit". Defaults to the item unit.'),
          imageSuffix: fields.text({
            label: "Image suffix",
            description:
              "Which item photo shows this variant: empty for the main photo, 2, 3, or hero.",
            validation: {
              pattern: { regex: OPTIONAL_PHOTO_SUFFIX, message: "Use 2–9 or hero" },
            },
          }),
        }),
        {
          label: "Variants",
          itemLabel: (props) => props.fields.name.value || "Variant",
        },
      ),
      quotes: fields.array(quote("below"), { label: "Quotes", itemLabel: quoteLabel }),
      image: fields.object(
        {
          alt: optionalText("Alt text", "Describes the main photo. Defaults to the name."),
          background: fields.select({
            label: "Photo background",
            options: PHOTO_BACKGROUNDS,
            defaultValue: "light",
          }),
          credit: optionalText("Photo credit", 'e.g. "Photo: Auckland Museum, CC BY 4.0".'),
        },
        {
          label: "Photo",
          description:
            "Photos are found by file name, not uploaded here: assets/<year>/items/<id>-<name>.<ext>, extras <id>-<name>-2, -3, item art <id>-<name>-hero.",
        },
      ),
      internalNote: fields.text({
        label: "Internal note",
        multiline: true,
        description: "Never shown.",
      }),
    },
  });

  const hosts = collection({
    label: `Hosts (${edition})`,
    slugField: "name",
    path: paths.hosts,
    format: { data: "yaml" },
    columns: ["role"],
    schema: {
      name: fields.slug({
        name: { label: "Name", description: "Full name, e.g. Wes Bos." },
        slug: {
          label: "Id",
          description: "Short permanent id, e.g. wes. Photo: assets/<year>/hosts/<id>.<ext>.",
        },
      }),
      shortName: fields.text({
        label: "Short name",
        description: 'Used in attributions and stickers: "Wes".',
        validation: { isRequired: true },
      }),
      role: fields.text({ label: "Role", validation: { isRequired: true } }),
      bio: copyArea("Bio", "One or two lines in catalog voice."),
      picksPage: fields.text({
        label: "Picks page",
        description: "Slug of this host's favorites page in the book. The page number is computed.",
        validation: { pattern: { regex: OPTIONAL_SLUG, message: "Use a page slug" } },
      }),
      order: fields.integer({
        label: "Order",
        description: "Position on Meet Your Shoppers (lowest first).",
        defaultValue: 0,
      }),
    },
  });

  const site = singleton({
    label: `Site (${edition})`,
    path: paths.site,
    format: { data: "yaml" },
    schema: {
      episode: fields.object(
        {
          number: fields.integer({ label: "Episode number" }),
          title: optionalText("Episode title"),
          videoUrl: fields.url({
            label: "Video URL",
            description: "The YouTube video. Catalog numbers link here at their timestamp.",
          }),
        },
        { label: "Episode" },
      ),
      meta: fields.object(
        {
          description: copyText(
            "Description",
            "The cover's share and search description. Other pages describe themselves from their title and section.",
          ),
        },
        { label: "Share & search" },
      ),
      links: fields.object(
        {
          buy: optionalText("Buy link label", '"Buy". Every item\'s purchase link.'),
          disclosure: copyText(
            "Affiliate disclosure",
            "One line on the order form page about affiliate links.",
          ),
        },
        { label: "Purchase links" },
      ),
      cover: fields.object(
        {
          price: optionalText("Cover price", '"FREE".'),
          tagline: copyText("Band tagline"),
          note: copyText("Band note", 'e.g. "{count} gifts · index on {page:index}".'),
        },
        { label: "Front cover" },
      ),
      welcome: fields.object(
        {
          title: copyText("How-to title"),
          steps: fields.array(
            fields.object({
              lead: fields.text({ label: "Bold lead-in", validation: { isRequired: true } }),
              text: copyArea("Text"),
            }),
            { label: "How-to steps", itemLabel: (props) => props.fields.lead.value || "Step" },
          ),
          shipLink: fields.object(
            {
              badge: optionalText("Badge", '"FREE".'),
              title: copyText("Title"),
              text: copyArea("Text"),
            },
            { label: "Ship-A-Link box" },
          ),
          watch: fields.object(
            { title: copyText("Title"), text: copyArea("Text") },
            { label: "Watch the episode" },
          ),
        },
        { label: "Welcome page" },
      ),
      key: fields.object(
        {
          title: copyText("Title", '"Know your WishBook".'),
          entries: fields.array(
            fields.object({
              symbol: fields.select({
                label: "Symbol",
                options: KEY_SYMBOLS,
                defaultValue: "letter",
              }),
              text: copyText("Explanation"),
              item: fields.relationship({
                label: "Example item",
                collection: "items",
                description: "Supplies the example catalog number, price, or picker.",
              }),
            }),
            { label: "Entries", itemLabel: (props) => props.fields.text.value || "Entry" },
          ),
        },
        { label: "Symbol key" },
      ),
      guarantee: fields.object(
        { lead: optionalText("Lead", '"Syntax Guarantee:".'), text: copyText("Text") },
        { label: "Guarantee" },
      ),
      orderLines: fields.array(
        fields.object({
          id: fields.text({
            label: "Id",
            description: "Pages pick an order line by this id.",
            validation: { isRequired: true, pattern: { regex: SLUG, message: "Use a-z, 0-9, -" } },
          }),
          kicker: copyText("Kicker", 'Small caps before the line, e.g. "Order by terminal".'),
          text: copyText("Line", 'e.g. "$ curl {catalog}".'),
          link: fields.select({
            label: "Link",
            description: "Where the line links to, if anywhere.",
            options: ORDER_LINE_LINKS,
            defaultValue: "",
          }),
          fallback: fields.text({
            label: "Fallback",
            description:
              "Id of the order line pages show instead while the link has no URL yet (the episode video URL is empty).",
            validation: { pattern: { regex: OPTIONAL_SLUG, message: "Use a-z, 0-9, -" } },
          }),
        }),
        {
          label: "Order lines",
          description:
            "Pages pick one by id, like a real catalog's rotating footers. The cover band and the back cover show their page's line.",
          itemLabel: (props) => props.fields.id.value || "Order line",
        },
      ),
      orderForm: fields.object(
        {
          shareLabel: copyText("Share button"),
          printLabel: copyText("Print button"),
        },
        { label: "Order form" },
      ),
      wishList: fields.object(
        {
          title: optionalText("Title", '"My Wish List". The wish-list page and the chrome link.'),
          circle: optionalText("Circle button", 'On every item until it is circled: "Circle it".'),
          circled: optionalText("Circled button", 'On a circled item: "Want!!".'),
          copied: copyText("Link copied", "Shown after Share copies the wish-list link."),
          empty: copyText("Empty list", "The wish-list page when a link lists nothing."),
          shared: copyText("Shared list intro", "Above the items on a shared wish list."),
          add: optionalText("Add button", '"Add these to my list".'),
          added: copyText("Added", "Shown after the shared items are added."),
          start: optionalText("Start button", '"Start my own".'),
          unpriced: copyText(
            "Unpriced footnote",
            "Under the order form total when a listed item has no price yet. The total gets a *.",
          ),
          mailTo: fields.array(fields.text({ label: "Line" }), {
            label: "Mail-to box (printed form)",
            description: "Address lines in the printed order form's mail-to-Santa box.",
            itemLabel: (props) => props.value || "Line",
          }),
        },
        { label: "Wish list" },
      ),
      search: fields.object(
        {
          label: optionalText("Search title", '"Search the WishBook". Also the chrome button.'),
          placeholder: optionalText("Placeholder"),
          none: copyText("No results"),
        },
        { label: "Search (⌘K)" },
      ),
      notFound: fields.object(
        {
          title: optionalText("Headline", '"Page Not Found". Also the tab title.'),
          text: copyArea("Text", "Under the headline."),
          cta: optionalText("Cover link", "The big link back to the cover."),
          contents: optionalText("Contents heading", "Above the links to each section."),
        },
        {
          label: "Page not found (404)",
          description: "The page shown for any address that isn't in the WishBook.",
        },
      ),
      mascots: fields.object(
        {
          search: assetKey(
            "Search: no results",
            "Grouse pose beside the search's no-results line.",
          ),
          emptyList: assetKey(
            "Order form: empty list",
            "Grouse pose on the order form while nothing is circled, beside the empty-list line.",
          ),
          wishList: assetKey("Wish-list page", "Grouse pose beside the shared wish list's title."),
          notFound: assetKey("Page not found", "Grouse pose on the 404 page."),
        },
        {
          label: "Mascots",
          description:
            "Asset keys (IMG-M1-…) for the grouse outside the book's pages. Empty for none.",
        },
      ),
      backCover: fields.object(
        {
          headline: copyText("Headline"),
          returnAddress: fields.array(fields.text({ label: "Line" }), {
            label: "Return address",
            itemLabel: (props) => props.value || "Line",
          }),
          mailTo: copyText(
            "Mail line",
            'Lead-in for the mail line under the headline, followed by the return address: "Mail your wish list to:".',
          ),
          indicia: fields.array(fields.text({ label: "Line" }), {
            label: "Postage indicia",
            itemLabel: (props) => props.value || "Line",
          }),
          mailingLabel: fields.array(fields.text({ label: "Line" }), {
            label: "Mailing label",
            itemLabel: (props) => props.value || "Line",
          }),
        },
        { label: "Back cover" },
      ),
      fillers: fields.array(
        fields.object({
          title: fields.text({ label: "Title", validation: { isRequired: true } }),
          text: copyArea("Text"),
          art: assetKey("Art", "Asset key from the assets manifest, e.g. a grouse cameo."),
        }),
        {
          label: "Filler pages",
          description:
            "Pages inserted automatically to keep spreads on the right sides. Used in order, then repeated.",
          itemLabel: (props) => props.fields.title.value || "Filler",
        },
      ),
    },
  });

  const sections = singleton({
    label: `Sections (${edition})`,
    path: paths.sections,
    format: { data: "yaml" },
    schema: {
      sections: fields.array(
        fields.object({
          id: fields.text({
            label: "Id",
            description: "Also the URL segment: /<year>/<id>/.",
            validation: { isRequired: true, pattern: { regex: SLUG, message: "Use a-z, 0-9, -" } },
          }),
          name: fields.text({ label: "Name", validation: { isRequired: true } }),
          code: fields.text({
            label: "Code",
            description: 'Short code, e.g. "FAV".',
            validation: { isRequired: true },
          }),
          color: fields.text({
            label: "Color",
            description: "Hex color, e.g. #C5301F.",
            validation: { isRequired: true, pattern: { regex: HEX, message: "Use #RRGGBB" } },
          }),
          kicker: copyText(
            "Section kicker",
            '"We have all the best for": above the section name on its divider or opener, and on price-tag pages without their own kicker.',
          ),
          tabLabel: optionalText("Tab label", "Thumb-index label. Defaults to the name."),
        }),
        {
          label: "Sections",
          description: "In book order.",
          itemLabel: (props) => props.fields.name.value || "Section",
        },
      ),
    },
  });

  const book = singleton({
    label: `Book order (${edition})`,
    path: paths.book,
    format: { data: "yaml" },
    schema: {
      pages: fields.array(
        fields.object({
          slug: fields.text({
            label: "Slug",
            description:
              "Unique. The URL is /<year>/<section>/<slug>/; a page whose slug equals its section is the divider at /<year>/<section>/. Without a divider, /<year>/<section>/ opens the section's first page.",
            validation: { isRequired: true, pattern: { regex: SLUG, message: "Use a-z, 0-9, -" } },
          }),
          section: fields.text({
            label: "Section",
            validation: { isRequired: true, pattern: { regex: SLUG, message: "Use a section id" } },
          }),
          template: fields.select({ label: "Layout", options: TEMPLATES, defaultValue: "grid" }),
          variant: fields.select({
            label: "Layout variant",
            options: PAGE_VARIANTS,
            defaultValue: "default",
          }),
          title: fields.text({
            label: "Title",
            description: "Page title: the <title>, share card, and page heading.",
            validation: { isRequired: true },
          }),
          opener: fields.checkbox({
            label: "Section opener",
            description:
              "Grid and feature layouts: a header across the top with the section's kicker, name, and page range. Use it on a section's first page.",
          }),
          hosts: fields.multiRelationship({
            label: "Picked by",
            collection: "hosts",
            description: "Shown on the picked-by sticker.",
          }),
          items: fields.array(
            fields.object({
              item: fields.relationship({
                label: "Item",
                collection: "items",
                validation: { isRequired: true },
              }),
              photo: fields.text({
                label: "Photo",
                description: "Which photo: empty for the main one, 2, 3, or hero.",
                validation: {
                  pattern: { regex: OPTIONAL_PHOTO_SUFFIX, message: "Use 2–9 or hero" },
                },
              }),
              caption: copyText("Caption", '"(A) Wes\'s 65W".'),
              text: copyArea(
                "Copy on this page",
                "Replaces the item description on this page only, e.g. a second appearance.",
              ),
              badge: optionalText("Badge", '"FREE Ship-A-Link®", "No monthly fee".'),
              group: optionalText(
                "Group",
                'Items with the same group share a box: "Home Assistant Corner".',
              ),
              maxQuotes: fields.integer({
                label: "Quotes shown",
                description:
                  "Full-page feature: how many of the item's quotes it shows, in order. Empty for 2; more only if the page still fits.",
                validation: { min: 0, max: 4 },
              }),
              fill: fields.checkbox({
                label: "Photo fills the stage",
                description:
                  "Full-page feature: a photo on its own background (not a cut-out) fills the stage edge to edge, cropped around its middle, a little below centre.",
              }),
              collage: fields.array(
                fields.text({
                  label: "Photo",
                  description: "Empty for the main photo, 2–9, or hero.",
                  validation: {
                    pattern: { regex: OPTIONAL_PHOTO_SUFFIX, message: "Use 2–9 or hero" },
                  },
                }),
                {
                  label: "Collage",
                  description:
                    "Full-page feature: several of the item's photos (book covers, say) scattered across the stage in this order, each whole, in place of the one photo. Up to 6.",
                  itemLabel: (props) => (props.value ? `Photo ${props.value}` : "Main photo"),
                },
              ),
            }),
            {
              label: "Items",
              description: "In order. Letters (A, B, C…) follow this order.",
              itemLabel: (props) => props.fields.item.value ?? "Item",
            },
          ),
          art: assetKey(
            "Art",
            "Asset key from the assets manifest (divider art, cover art, centerfold).",
          ),
          inset: fields.object(
            {
              art: assetKey("Inset art", "Asset key for the inset photo."),
              caption: copyText("Inset caption"),
            },
            { label: "Inset photo" },
          ),
          mascot: assetKey(
            "Mascot",
            "Asset key of a grouse mascot pose (IMG-M1-…) on this page. Welcome, holly, index, and order form place it in their own spot (on the order form once the wish list has items); grid, under, feature, lineup, price-tag, wild, and odds 'n' ends stand it at the head's right end, a small sticker by the title (a section's first page). Empty for none.",
          ),
          mascotFlip: fields.checkbox({
            label: "Mirror the mascot",
            description:
              "Flip the pose to face into the page. Never for a pose with lettering on it (the $ tag, the joker card).",
          }),
          copy: fields.object(
            {
              kicker: copyText("Kicker", "Small caps above the headline."),
              headline: copyText("Headline", "Display headline when it differs from the title."),
              script: copyText("Script accent", 'Great Vibes accent word: "gifts".'),
              tagline: copyText("Tagline"),
              subhead: copyText("Subhead"),
              sticker: copyText("Sticker"),
              body: copyArea("Body", "Running copy. Separate paragraphs with a blank line."),
              note: copyText("Note", "Small italic note under the order lines."),
              badge: copyText("Badge", '"Only one available".'),
              meta: copyText("Meta line"),
              xref: copyText("Cross-reference line", '"More of Wes\'s favorites on {page:wes}."'),
              footer: copyText("Footer band"),
              smallprint: copyText("Small print"),
            },
            { label: "Copy" },
          ),
          quotes: fields.array(quote("bubble"), {
            label: "Page quotes",
            description: "Quotes that belong to the page, not to one item (bubbles, one-liners).",
            itemLabel: quoteLabel,
          }),
          orderLine: fields.text({
            label: "Order line",
            description:
              "Order line id from Site, shown on this page (a footer banner, or the layout's own spot). Leave empty for none.",
            validation: { pattern: { regex: OPTIONAL_SLUG, message: "Use an order line id" } },
          }),
          centerfold: fields.object(
            {
              focal: fields.text({
                label: "Focal point",
                description: 'CSS position kept in view when the art is cropped: "40% 55%".',
              }),
              hotspots: fields.array(
                fields.object({
                  item: fields.relationship({
                    label: "Item",
                    collection: "items",
                    validation: { isRequired: true },
                  }),
                  x: fields.number({
                    label: "x (%)",
                    validation: { isRequired: true, min: 0, max: 100 },
                  }),
                  y: fields.number({
                    label: "y (%)",
                    validation: { isRequired: true, min: 0, max: 100 },
                  }),
                  label: copyText("Legend label", '"St. Bernard on a cooling mat".'),
                }),
                {
                  label: "Hotspots",
                  itemLabel: (props) =>
                    props.fields.label.value || props.fields.item.value || "Hotspot",
                },
              ),
            },
            { label: "Centerfold" },
          ),
        }),
        {
          label: "Pages",
          description: "In book order. Page numbers and filler pages are computed.",
          itemLabel: (props) => `${props.fields.slug.value} · ${props.fields.template.value}`,
        },
      ),
    },
  });

  const timestamps = singleton({
    label: `Timestamps (${edition})`,
    path: paths.timestamps,
    format: { data: "yaml" },
    schema: {
      timestamps: fields.array(
        fields.object({
          item: fields.relationship({
            label: "Item",
            collection: "items",
            validation: { isRequired: true },
          }),
          variant: fields.text({
            label: "Variant",
            description: "Variant key, or empty for the item itself.",
            validation: { pattern: { regex: OPTIONAL_SLUG, message: "Use a variant key" } },
          }),
          time: fields.text({
            label: "Time",
            description: "mm:ss or h:mm:ss into the episode. Empty until the final cut.",
            validation: { pattern: { regex: OPTIONAL_TIMESTAMP, message: "Use mm:ss or h:mm:ss" } },
          }),
        }),
        {
          label: "Timestamps",
          description: "The one place catalog numbers come from.",
          itemLabel: (props) =>
            `${props.fields.item.value ?? "?"}${props.fields.variant.value ? `/${props.fields.variant.value}` : ""} · ${props.fields.time.value || "--:--"}`,
        },
      ),
    },
  });

  const assets = singleton({
    label: `Generated art (${edition})`,
    path: paths.assets,
    format: { data: "yaml" },
    schema: {
      assets: fields.array(
        fields.object({
          key: fields.text({
            label: "Key",
            description: 'Pages refer to art by this key, e.g. "IMG-F1".',
            validation: {
              isRequired: true,
              pattern: { regex: /^[A-Za-z0-9-]+$/, message: "Use letters, digits, -" },
            },
          }),
          file: fields.text({
            label: "File",
            description:
              "Path under assets/<year>/, e.g. generated/stockings. The extension doesn't matter. Until the file exists, a placeholder shows.",
            validation: { isRequired: true },
          }),
          label: fields.text({
            label: "Placeholder title",
            description: "Short title shown on the placeholder.",
            validation: { isRequired: true },
          }),
          color: fields.text({
            label: "Placeholder color",
            validation: { pattern: { regex: OPTIONAL_HEX, message: "Use #RRGGBB" } },
          }),
          aspect: fields.text({ label: "Aspect", description: '"4:5", "3:2", "1:1".' }),
          prompt: fields.text({ label: "Prompt", multiline: true }),
          sourceItem: fields.relationship({ label: "Source item", collection: "items" }),
        }),
        {
          label: "Art",
          itemLabel: (props) => `${props.fields.key.value} · ${props.fields.label.value}`,
        },
      ),
    },
  });

  const global = singleton({
    label: "Global (all editions)",
    path: "content/global",
    format: { data: "yaml" },
    schema: {
      name: fields.text({ label: "Site name", validation: { isRequired: true } }),
      podcastUrl: fields.url({ label: "Podcast URL" }),
      youtubeUrl: fields.url({ label: "YouTube channel URL" }),
    },
  });

  return config({
    storage: { kind: "local" },
    ui: {
      brand: { name: `WishBook ${edition}` },
      navigation: {
        [`Edition ${edition}`]: [
          "items",
          "hosts",
          "book",
          "sections",
          "timestamps",
          "site",
          "assets",
        ],
        Shared: ["global"],
      },
    },
    collections: { items, hosts },
    singletons: { site, sections, book, timestamps, assets, global },
  });
}

export type KeystaticConfig = ReturnType<typeof createKeystaticConfig>;
