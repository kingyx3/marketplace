# TCGplayer catalog assist

The Catalog control centre can use a TCGplayer product URL or numeric product ID to prefill a new internal product and the physical SKUs returned for it. This is an operator convenience layer, not a source of truth and not a replacement for local pricing, supply, storefront, or publication approvals.

## Operator workflow

1. Open **Control → Catalog → Create product**.
2. Paste a TCGplayer product URL or product ID into **Catalog assist**.
3. Review the returned product name, image, language, category, set, product type, SKU variants, packaging values, and market-price reference.
4. Map the suggestion to existing local records or choose to create a new category, set, or product type.
5. Review each imported SKU. The form fills the local SKU code, barcode, packs per box, cards per pack, and weight whenever TCGplayer supplies them. Values TCGplayer does not supply remain blank.
6. Create the internal draft. The product hierarchy and all returned SKUs are written in one database transaction.
7. Continue through the normal pricing, supply, listing, readiness, and publication steps.

The manual hierarchy form remains available on the same page when the external lookup is unavailable or unsuitable.

## Endpoint review and provider choice

TCGplayer's documented Catalog API exposes categories, groups/sets, products, and product SKU relationships, while its Pricing API exposes group and product pricing. Access requires an existing TCGplayer API application and new API access is no longer generally issued.

The implemented fallback uses the read-only public storefront product endpoints:

- `mp-search-api.tcgplayer.com/v2/product/{productId}/details`
- `mpapi.tcgplayer.com/v2/product/{productId}/pricepoints`
- `mpapi.tcgplayer.com/v2/product/{productId}/skus`

The public set-wide price-guide endpoint under `infinite-api.tcgplayer.com` is not used. Product intake needs one bounded product record, and a set-wide response is larger, less targeted, and unnecessary for this workflow.

These storefront endpoints are undocumented and may change without notice. The integration therefore remains optional and never blocks manual catalog administration.

## SKU import behaviour

- Every returned TCGplayer SKU is included by default, up to the existing 50-SKU response cap.
- The stable local SKU code is generated from the TCGplayer product and SKU IDs and remains editable before creation.
- SKU-specific barcode and packaging values take precedence over product-level values.
- A product UPC is used as the barcode only when TCGplayer returns exactly one SKU and no SKU-specific barcode.
- Condition, language, printing, every returned TCGplayer SKU/condition/language/printing/variant identifier, and USD market/low/mid/high/direct-low price references are retained in the product variant attributes for traceability.
- Market prices are not promoted to local selling prices. Pricing remains versioned and permissioned in the Pricing domain.
- Inventory records are initialized with zero stock, consistent with normal local SKU creation.

## Security and reliability controls

- The browser calls only the same-origin application API.
- The API and creation action require the existing `catalog.manage` permission.
- Requests are rate-limited per authenticated administrator.
- The server constructs requests from a numeric product ID and fixed provider hosts; it never fetches an administrator-supplied host.
- Input accepts only a numeric ID or a `tcgplayer.com` product URL.
- Upstream calls use a ten-second timeout, a two-megabyte response limit, `no-store`, and JSON-only parsing.
- Returned source and image URLs are normalized to HTTP or HTTPS; the source link is restricted to the TCGplayer domain.
- Product details are required, while prices and SKU variants are optional enrichment with clear warnings when unavailable.
- External descriptions are stripped of markup before they are placed in the editable form.
- The submitted SKU payload is size-limited, capped at 50 entries, normalized in the server action, validated again in PostgreSQL, and written atomically with the product.

## Domain boundaries

Catalog assist may prefill or create:

- category
- set
- product type
- product draft
- physical SKU records and their source variant metadata

It does not automatically create or approve:

- local selling prices
- non-zero inventory or purchase-order supply
- storefront availability or listing content
- publication state

Those values continue through their established domain permissions, validations, audit logs, readiness checks, and approval actions.
