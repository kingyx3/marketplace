# TCGplayer catalog assist

The Catalog control centre can use a TCGplayer product URL or numeric product ID to create a complete internal catalog draft automatically. The import creates or reuses the required hierarchy, creates the product, and creates every physical SKU returned by TCGplayer in one transaction. It remains an operator convenience layer rather than a source of truth or a replacement for local pricing, supply, storefront, or publication approvals.

## Operator workflow

1. Open **Control → Catalog → Create product**.
2. Paste a TCGplayer product URL or numeric product ID into **Automatic catalog import**.
3. Select **Import product and SKUs**.
4. The server retrieves the complete TCGplayer record, matches existing category, set, and product-type records by normalized name, and creates missing hierarchy records when no match exists.
5. The product and every returned physical SKU are written atomically.
6. The administrator lands on the import confirmation screen. The product section and every SKU section can be opened, reviewed, and saved independently.
7. Continue through the normal pricing, supply, listing, readiness, and publication steps.

The manual hierarchy form remains available on the same page when the external lookup is unavailable or unsuitable.

## Endpoint review and provider choice

TCGplayer's documented Catalog API exposes categories, groups or sets, products, and product SKU relationships, while its Pricing API exposes group and product pricing. Access requires an existing TCGplayer API application and new API access is no longer generally issued.

The implemented fallback uses the read-only public storefront product endpoints:

- `mp-search-api.tcgplayer.com/v2/product/{productId}/details`
- `mpapi.tcgplayer.com/v2/product/{productId}/pricepoints`
- `mpapi.tcgplayer.com/v2/product/{productId}/skus`

The public set-wide price-guide endpoint under `infinite-api.tcgplayer.com` is not used. Product intake needs one bounded product record, and a set-wide response is larger, less targeted, and unnecessary for this workflow.

These storefront endpoints are undocumented and may change without notice. The integration therefore remains optional and never blocks manual catalog administration.

## Automatic hierarchy behavior

- Existing categories, sets, and product types are reused when their normalized names match TCGplayer data.
- Product-type aliases cover common sealed formats such as booster boxes, booster packs, elite trainer boxes, decks, collections, bundles, and tins.
- Missing category, set, product-type, product-name, language, or release-date values receive safe deterministic fallbacks so the import does not require a large pre-creation correction form.
- Provider descriptions are stripped of markup and bounded to the local product limit.
- The post-import confirmation screen is the human review boundary. Correcting the product does not submit any SKU, and correcting one SKU does not overwrite another SKU.

## SKU import behavior

- Every returned TCGplayer SKU is included by default, up to the existing 50-SKU response cap.
- The stable local SKU code is generated from the TCGplayer product and SKU IDs and remains editable after creation.
- SKU-specific barcode and packaging values take precedence over product-level values.
- A product UPC is used as the barcode only when TCGplayer returns exactly one SKU and no SKU-specific barcode.
- Condition, language, printing, every returned TCGplayer SKU, condition, language, printing, and variant identifier, and USD market, low, mid, high, and direct-low price references are retained in the product variant attributes for traceability.
- Market prices are not promoted to local selling prices. Pricing remains versioned and permissioned in the Pricing domain.
- Inventory records are initialized with zero stock, consistent with normal local SKU creation.
- When TCGplayer returns no SKU variants, the product is still created and the confirmation screen directs the administrator to add a local SKU manually.

## Security and reliability controls

- The browser submits only the TCGplayer reference to the application server action; it never calls provider hosts directly.
- The creation action requires the existing `catalog.manage` permission.
- Imports are rate-limited per authenticated administrator.
- The server constructs requests from a numeric product ID and fixed provider hosts; it never fetches an administrator-supplied host.
- Input accepts only a numeric ID or a `tcgplayer.com` product URL.
- Upstream calls use a ten-second timeout, a two-megabyte response limit, `no-store`, and JSON-only parsing.
- Returned source and image URLs are normalized to HTTP or HTTPS; the source link is restricted to the TCGplayer domain.
- Product details are required, while prices and SKU variants are optional enrichment with clear fallback behavior when unavailable.
- The generated SKU payload is size-limited, capped at 50 entries, normalized in the server action, validated again in PostgreSQL, and written atomically with the product.

## Domain boundaries

Catalog assist may create:

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
