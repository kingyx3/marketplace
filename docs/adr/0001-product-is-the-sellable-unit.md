# ADR 0001: Product is the only sellable catalog unit

- Status: Accepted
- Date: 2026-07-22

## Context

The catalog originally separated a customer-facing product from one or more local SKUs. In
practice, every operational workflow selected a SKU: pricing, inventory, purchase orders,
deals, carts, preorders, and order lines. The product record was therefore a grouping layer
with no independent commercial meaning. This made product creation a multi-step process and
forced administrators to understand two names for the same sellable item.

TCGplayer also uses the word SKU for identifiers returned by its storefront endpoints. Those
identifiers describe external variants and must not dictate the local domain model.

## Decision

`Product` is the sole local sellable unit and the only catalog identity used by administrators,
customers, and operational workflows.

- A product owns its display identity, internal reference, barcode, physical attributes,
  pricing, inventory, publication state, and external-source metadata.
- A TCGplayer lookup creates one local product for every sellable variant returned by
  TCGplayer. If no variants are returned, it creates one product from the product-level data.
- TCGplayer variant identifiers are stored inside immutable source metadata. They are never
  local record identifiers and are not shown as a separate local entity.
- Product creation is atomic and comprehensive. Category, set, product type, products,
  zero-stock inventory, and the import receipt are created together.
- The completion screen is the hand-off point. It lists every created product in its own
  expandable section and links directly to that product's editor.
- Local APIs, routes, database foreign keys, forms, events, and copy use `product` and
  `product_id`; no local SKU compatibility aliases are maintained.

## Consequences

The catalog and commerce model has one fewer entity and one fewer administrator workflow.
External imports are deterministic and can be reviewed as a batch. Pricing and stock remain
explicit human decisions and start at zero.

This is an intentionally breaking decision. Development and hosted databases must be rebuilt
from the product-only schema; preserving or translating the former local SKU model is outside
scope.

