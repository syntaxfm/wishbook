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

const COPY_HINT =
  "Copy markup: **bold**, *italic*, {page:slug} for a page reference, {syn:item-slug} for a catalog number, {count}, {phone}, {catalog}.";

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
  { value: "order-form", label: "Index & order form" },
  { value: "back-cover", label: "Back cover" },
] as const;

export type Template = (typeof TEMPLATES)[number]["value"];

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
        description: "Where to buy. Prefer the Amazon affiliate link when one exists.",
      }),
      makerLink: fields.url({
        label: "Maker link",
        description: "The manufacturer's product page.",
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
          buy: optionalText("Buy link label", '"Buy". Every item\'s primary (affiliate) link.'),
          maker: optionalText("Maker link label", '"Maker". The manufacturer\'s page.'),
          missingBuy: optionalText(
            "Missing buy link",
            'Shown in place of the buy link until there is one: "Buy link TBA".',
          ),
          missingMaker: optionalText(
            "Missing maker link",
            'Shown in dev builds in place of a missing maker link: "Maker link TBA".',
          ),
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
          note: copyText("Band note", 'e.g. "{count} gifts · index on {page:order-form}".'),
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
          text: copyText("Line", 'e.g. "Call any time {phone}".'),
        }),
        {
          label: "Order lines",
          description:
            "Pages pick one by id, like a real catalog's rotating footers. The one with {phone} is also the cover band and back cover phone line.",
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
      backCover: fields.object(
        {
          headline: copyText("Headline"),
          returnAddress: fields.array(fields.text({ label: "Line" }), {
            label: "Return address",
            itemLabel: (props) => props.value || "Line",
          }),
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
          kicker: copyText("Divider kicker", '"We have all the best for".'),
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
              "Unique. The URL is /<year>/<section>/<slug>/; a page whose slug equals its section is the divider at /<year>/<section>/.",
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
            description: 'Pages refer to art by this key, e.g. "IMG-S1".',
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
      phone: fields.object(
        {
          display: fields.text({
            label: "Display",
            description: "The one place the phone number lives.",
            validation: { isRequired: true },
          }),
          tel: fields.text({
            label: "Dialable",
            description: "For tel: links, digits only with a leading +. Empty to skip the link.",
            validation: { pattern: { regex: /^(?:\+\d{7,15})?$/, message: "Use +digits" } },
          }),
        },
        { label: "Phone" },
      ),
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
