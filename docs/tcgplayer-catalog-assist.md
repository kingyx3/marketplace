# TCGplayer catalog assist

The Catalog control centre can use a TCGplayer product URL or numeric product ID to prefill a new internal product draft. This is an operator convenience layer, not a source of truth and not a replacement for the existing catalog, pricing, supply, storefront, or publication approvals.

## Operator workflow

1. Open **Control → Catalog → Create product**.
2. Paste a TCGplayer product URL or product ID into **Catalog assist**.
3. Review the returned product name, image, language, category, set, product type, SKU variants, and market-price reference.
4. Map the suggestion to existing local records or choose to create a new category, set, or product type.
5. Edit any imported value and create the internal draft.
6. Continue through the normal local SKU, pricing, supply, listing, readiness, and publication steps.

The manual hierarchy form remains available on the same page when the external lookup is unavailable or unsuitable.

## Endpoint review and provider choice

TCGplayer's documented Catalog API exposes categories, groups/sets, products, and product SKU relationships, while its Pricing API exposes group and product pricing. Access requires an existing TCGplayer API application and new API access is no longer generally issued.

The implemented fallback uses the read-only public storefront product endpoints under `mpapi.tcgplayer.com`:

- `/v2/product/{productId}/details`
- `/v2/product/{productId}/pricepoints`
- `/v2/product/{productId}/skus`

The public set-wide price-guide endpoint under `infinite-api.tcgplayer.com` was reviewed but is not used. Product intake needs one bounded product record, and a set-wide response is larger, less targeted, and unnecessary for this workflow.

These storefront endpoints are undocumented and may change without notice. The integration therefore remains optional, has no database synchronization job, and never blocks manual catalog administration.

## Security and reliability controls

- The browser calls only the same-origin application API.
- The API requires the existing `catalog.manage` permission.
- Requests are rate-limited per authenticated administrator.
- The server constructs requests from a numeric product ID and a fixed provider base URL; it never fetches an administrator-supplied host.
- Input accepts only a numeric ID or a `tcgplayer.com` product URL.
- Upstream calls use a ten-second timeout, a two-megabyte response limit, `no-store`, and JSON-only parsing.
- Returned source and image URLs are normalized to HTTP or HTTPS; the source link is restricted to the TCGplayer domain.
- Product details are required, while prices and SKU variants are optional enrichment with clear warnings when unavailable.
- External descriptions are stripped of markup before they are placed in the editable form.
- The lookup performs no write against TCGplayer and stores nothing until the administrator submits the local draft.

## Domain boundaries

Catalog assist may prefill or create only the existing product hierarchy:

- category
- set
- product type
- product draft

TCGplayer market prices and SKU variants are displayed as references only. The integration does not automatically create or approve:

- local physical SKUs
- versioned prices
- inventory or purchase-order supply
- storefront availability or listing content
- publication state

Those values continue through their established domain permissions, validations, audit logs, readiness checks, and approval actions.
