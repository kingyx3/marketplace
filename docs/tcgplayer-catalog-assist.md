# TCGplayer catalog assist

Catalog assist turns a TCGplayer product URL or numeric product ID into complete local product
drafts. It is an operator convenience layer; TCGplayer remains reference data, not the local
source of truth.

The local domain has one sellable entity: **Product**. TCGplayer's sellable variant records are treated as
external variants. Each returned sellable variant becomes an independent local product with its
own reference, barcode, packaging attributes, pricing, inventory, listing, and publication state.
See [ADR 0001](adr/0001-product-is-the-sellable-unit.md).

## Operator workflow

1. Open **Control → Catalog → Create product**.
2. Paste a TCGplayer product URL or numeric product ID into **Catalog assist**.
3. The application fetches product details, prices, and variants automatically.
4. Review the shared category, set, and product-type mappings and each product draft. Missing
   provider values remain blank and can be filled locally.
5. Submit once. The hierarchy, every product, zero-stock inventory rows, source metadata, and
   the import receipt are written in one transaction.
6. The application opens an import confirmation screen. Every created product has a separate,
   expandable section with a direct **Open and edit product** action.
7. Complete local pricing, inventory, listing approval, and publication as needed.

When TCGplayer returns no variants, the workflow still creates one product from product-level
details. The manual product form remains available when the provider is unavailable or unsuitable.

## Data retained from TCGplayer

- Product name, description, image, category, set, product type, and product-level UPC.
- Every returned variant's condition, language, printing, barcode, packaging values, and
  provider identifiers.
- USD market, low, mid, high, and direct-low price references.

Provider identifiers live in `products.source_metadata`; they are never local record IDs.
Provider prices are reference metadata and never become local selling prices. Product inventory
and local price start at zero.

## Security and reliability controls

- The browser calls only the same-origin application API.
- Lookup and creation require `catalog.manage`.
- Requests are rate-limited per authenticated administrator.
- The server constructs requests from a numeric product ID and fixed provider hosts; it never
  fetches an administrator-supplied host.
- Inputs accept only a numeric ID or a `tcgplayer.com` product URL.
- Upstream calls have a ten-second timeout, a two-megabyte response limit, `no-store`, and
  JSON-only parsing.
- External descriptions are stripped of markup before entering editable fields.
- The submitted product list is size-limited, capped at 50, normalized in the server action,
  validated again in PostgreSQL, and written atomically.

The storefront endpoints are undocumented and can change without notice. Catalog assist is
optional and never blocks manual administration.
