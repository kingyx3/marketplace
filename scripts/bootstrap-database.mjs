#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";

export const DATABASE_BOOTSTRAP_TARGETS = ["development", "staging"];

export const SEEDED_PUBLIC_TABLES = [
  "admin_access_grant_permissions",
  "admin_access_grants",
  "allocation_rules",
  "api_idempotency_records",
  "api_rate_limit_buckets",
  "audit_logs",
  "booster_box_skus",
  "control_permission_definitions",
  "customers",
  "inventory",
  "limited_time_deals",
  "listing_items",
  "notifications",
  "order_items",
  "orders",
  "payment_exceptions",
  "payments",
  "preorders",
  "product_types",
  "product_variants",
  "products",
  "purchase_order_items",
  "purchase_orders",
  "refunds",
  "sets_releases",
  "shipments",
  "sku_prices",
  "staff_users",
  "storefront_configurations",
  "suppliers",
  "tcg_categories",
  "waitlist_entries",
  "webhook_events",
].sort();

const FIXTURE_IDS = Object.freeze({
  staff: "10000000-0000-4000-8000-000000000001",
  grant: "10000000-0000-4000-8000-000000000002",
  category: "10000000-0000-4000-8000-000000000003",
  set: "10000000-0000-4000-8000-000000000004",
  productType: "10000000-0000-4000-8000-000000000005",
  product: "10000000-0000-4000-8000-000000000006",
  variant: "10000000-0000-4000-8000-000000000007",
  sku: "10000000-0000-4000-8000-000000000008",
  inventory: "10000000-0000-4000-8000-000000000010",
  storefrontConfiguration: "10000000-0000-4000-8000-000000000012",
  deal: "10000000-0000-4000-8000-000000000013",
  supplier: "10000000-0000-4000-8000-000000000014",
  purchaseOrder: "10000000-0000-4000-8000-000000000015",
  purchaseOrderItem: "10000000-0000-4000-8000-000000000016",
  preorder: "10000000-0000-4000-8000-000000000017",
  order: "10000000-0000-4000-8000-000000000018",
  orderItem: "10000000-0000-4000-8000-000000000019",
  orderPayment: "10000000-0000-4000-8000-000000000020",
  preorderPayment: "10000000-0000-4000-8000-000000000021",
  refund: "10000000-0000-4000-8000-000000000022",
  shipment: "10000000-0000-4000-8000-000000000023",
  allocationRule: "10000000-0000-4000-8000-000000000024",
  notification: "10000000-0000-4000-8000-000000000025",
  webhookEvent: "10000000-0000-4000-8000-000000000026",
  paymentException: "10000000-0000-4000-8000-000000000027",
  waitlist: "10000000-0000-4000-8000-000000000028",
  audit: "10000000-0000-4000-8000-000000000029",
  idempotency: "10000000-0000-4000-8000-000000000030",
});

const CATEGORY = Object.freeze({
  slug: "bootstrap-fixture",
  name: "Bootstrap Fixture TCG",
  publisher: "Marketplace QA",
  description: "Stable catalog data created by the database bootstrap workflow.",
  sortOrder: 999,
});

const RELEASE = Object.freeze({
  name: "Bootstrap Visibility Set",
  code: "BST",
  description: "A released set used to verify catalog lifecycle and storefront visibility.",
});

const PRODUCT_TYPE = Object.freeze({ code: "bootstrap_box", name: "Bootstrap box" });
const PRODUCT_NAME = "Bootstrap Visibility Product";
const SKU = "BOOTSTRAP-BST-BOX-EN";
const CURRENCY = "SGD";
const PRICE_CENTS = 19_900;
const COMPARE_AT_CENTS = 22_000;
const DEAL_PRICE_CENTS = 18_400;
const IDEMPOTENCY_KEY_HASH = "a".repeat(64);
const IDEMPOTENCY_REQUEST_HASH = "b".repeat(64);

export function discoverActivePublicTables(sqlByFilename) {
  const active = new Set();
  const entries = Object.entries(sqlByFilename).sort(([a], [b]) => a.localeCompare(b));

  for (const [, sql] of entries) {
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi
    )) {
      active.add(match[1].toLowerCase());
    }
    for (const statement of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([^;]+);/gi)) {
      for (const table of statement[1].matchAll(/public\.([a-z0-9_]+)/gi)) {
        active.delete(table[1].toLowerCase());
      }
    }
  }

  return [...active].sort();
}

export function compareBootstrapCoverage(activeTables, seededTables = SEEDED_PUBLIC_TABLES) {
  const active = new Set(activeTables);
  const seeded = new Set(seededTables);
  return {
    missing: [...active].filter((table) => !seeded.has(table)).sort(),
    stale: [...seeded].filter((table) => !active.has(table)).sort(),
  };
}

async function main() {
  const target = parseTarget(process.argv.slice(2), process.env.TARGET_ENV);
  process.env.TARGET_ENV = target;
  await applyVersionedEnvironmentConfig(process.env, { targetEnv: target });
  await assertManifestCoversMigrations();

  const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnvironment("SUPABASE_SECRET_KEY");
  const publishableKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const siteUrl = requireEnvironment("NEXT_PUBLIC_SITE_URL");
  const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  assertTargetSafety(target, supabaseUrl);

  const secretClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const now = new Date();
  const dates = createFixtureDates(now);
  const actorEmail = `bootstrap-admin-${target}@example.com`;
  const customerEmail = `bootstrap-customer-${target}@example.com`;
  const actorUser = await ensureAuthUser(secretClient, actorEmail, "Database Bootstrap Admin");
  const customerUser = await ensureAuthUser(
    secretClient,
    customerEmail,
    "Database Bootstrap Customer"
  );

  await seedAdministrator(secretClient, actorUser, actorEmail, now);
  await seedCatalogBase(secretClient, target, dates);
  const customerId = await seedCustomerAndCommerce(
    secretClient,
    customerUser,
    customerEmail,
    target,
    now,
    dates
  );
  await seedServerLedgers(secretClient, actorUser.id, target, now, dates);
  await exerciseAdminMutationApis(secretClient, actorUser.id, dates);
  await verifyCompletedIdempotency(secretClient, actorUser.id);

  await upsert(secretClient, "audit_logs", {
    id: FIXTURE_IDS.audit,
    actor: `bootstrap:${target}`,
    table_name: "database_bootstrap",
    record_id: FIXTURE_IDS.product,
    action: "DATABASE_BOOTSTRAP_COMPLETE",
    old_data: null,
    new_data: {
      target,
      product_id: FIXTURE_IDS.product,
      customer_id: customerId,
      sku: SKU,
      deal_price_cents: DEAL_PRICE_CENTS,
      visible: true,
    },
  });

  const product = await verifySecretRead(secretClient);
  await verifyAnonymousRead(supabaseUrl, publishableKey);
  await verifyHostedStorefront(siteUrl, product.slug, vercelBypassSecret);

  const summary = {
    target,
    productId: FIXTURE_IDS.product,
    productSlug: product.slug,
    sku: SKU,
    dealPriceCents: DEAL_PRICE_CENTS,
    publicTablesCovered: SEEDED_PUBLIC_TABLES.length,
    anonymousReadVerified: true,
    hostedStorefrontVerified: true,
  };
  console.log(JSON.stringify(summary, null, 2));
  await appendGithubSummary(summary);
}

function createFixtureDates(now) {
  return {
    releaseDate: now.toISOString().slice(0, 10),
    startsAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    expectedAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ledgerExpiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    expiredAt: new Date(now.getTime() - 1000).toISOString(),
  };
}

async function seedAdministrator(client, actorUser, actorEmail, now) {
  await upsert(client, "staff_users", {
    id: FIXTURE_IDS.staff,
    auth_user_id: actorUser.id,
    email: actorEmail,
    role: "owner",
    source: "database",
    active: true,
    last_seen_at: now.toISOString(),
  });
  const { data: existingGrant, error: existingGrantError } = await client
    .from("admin_access_grants")
    .select("accepted_at")
    .eq("id", FIXTURE_IDS.grant)
    .maybeSingle();
  if (existingGrantError) {
    throw new Error(
      `Could not read bootstrap administrator grant: ${existingGrantError.message}`
    );
  }
  await upsert(client, "admin_access_grants", {
    id: FIXTURE_IDS.grant,
    email: actorEmail,
    role: "owner",
    active: true,
    auth_user_id: actorUser.id,
    created_by_staff_id: FIXTURE_IDS.staff,
    accepted_at: existingGrant?.accepted_at ?? now.toISOString(),
    revoked_at: null,
  });

  await verifyReferenceRow(
    client,
    "control_permission_definitions",
    "permission_key",
    "control.view"
  );
  const permissionKeys = await selectColumn(
    client,
    "control_permission_definitions",
    "permission_key"
  );
  await upsertMany(
    client,
    "admin_access_grant_permissions",
    permissionKeys.map((permissionKey) => ({
      grant_id: FIXTURE_IDS.grant,
      permission_key: permissionKey,
      created_by_staff_id: FIXTURE_IDS.staff,
    })),
    "grant_id,permission_key"
  );
}

async function seedCatalogBase(client, target, dates) {
  await upsert(
    client,
    "product_types",
    {
      id: FIXTURE_IDS.productType,
      code: PRODUCT_TYPE.code,
      name: PRODUCT_TYPE.name,
      active: true,
      sort_order: 999,
    },
    "code"
  );
  await upsert(
    client,
    "tcg_categories",
    {
      id: FIXTURE_IDS.category,
      parent_id: null,
      slug: CATEGORY.slug,
      name: CATEGORY.name,
      publisher: CATEGORY.publisher,
      description: CATEGORY.description,
      active: true,
      sort_order: CATEGORY.sortOrder,
    },
    "slug"
  );
  await upsert(client, "sets_releases", {
    id: FIXTURE_IDS.set,
    category_id: FIXTURE_IDS.category,
    name: RELEASE.name,
    code: RELEASE.code,
    description: RELEASE.description,
    release_date: dates.releaseDate,
    preorder_open_at: null,
    preorder_close_at: null,
    status: "released",
    active: true,
    sort_order: 999,
  });
  await upsert(client, "products", {
    id: FIXTURE_IDS.product,
    category_id: FIXTURE_IDS.category,
    set_id: FIXTURE_IDS.set,
    name: PRODUCT_NAME,
    product_type: PRODUCT_TYPE.code,
    description:
      "Visible bootstrap fixture. Its publication, active price, and sellable stock verify the storefront contract.",
    language: "EN",
    image_url: null,
    active: true,
  });
  await upsert(
    client,
    "product_variants",
    {
      id: FIXTURE_IDS.variant,
      product_id: FIXTURE_IDS.product,
      name: "default",
      attributes: { bootstrap: true, target },
    },
    "product_id,name"
  );
  await upsert(
    client,
    "booster_box_skus",
    {
      id: FIXTURE_IDS.sku,
      product_variant_id: FIXTURE_IDS.variant,
      sku: SKU,
      barcode: "888800000001",
      packs_per_box: 24,
      cards_per_pack: 12,
      msrp_cents: COMPARE_AT_CENTS,
      price_cents: PRICE_CENTS,
      currency: CURRENCY,
      weight_grams: 900,
      active: true,
    },
    "sku"
  );
  await deleteWhere(client, "sku_prices", "sku_id", FIXTURE_IDS.sku);
  await upsert(
    client,
    "inventory",
    {
      id: FIXTURE_IDS.inventory,
      sku_id: FIXTURE_IDS.sku,
      location: "main",
      on_hand: 24,
      allocated: 0,
      incoming: 6,
      safety_stock: 2,
    },
    "sku_id,location"
  );
  await upsert(
    client,
    "listing_items",
    {
      product_id: FIXTURE_IDS.product,
      title_override: PRODUCT_NAME,
      badge_label: "Test data",
      tags: ["bootstrap", "api-smoke-test"],
      channels: ["b2c"],
      max_per_customer: 4,
      preorder_reserve: 0,
      sort_priority: 999,
      featured: true,
      published: false,
      availability_mode: "available_now",
      order_open_at: null,
      order_close_at: null,
      release_date: dates.releaseDate,
    },
    "product_id"
  );
  await upsert(
    client,
    "storefront_configurations",
    {
      id: FIXTURE_IDS.storefrontConfiguration,
      key: "bootstrap_fixture",
      label: "Database bootstrap fixture",
      description: "Records the most recent successful bootstrap target.",
      value: { target, productId: FIXTURE_IDS.product, sku: SKU },
      active: true,
    },
    "key"
  );
  await upsert(client, "suppliers", {
    id: FIXTURE_IDS.supplier,
    name: "Bootstrap Test Distributor",
    supplier_type: "distributor",
    region: "SG",
    contact: { email: "bootstrap-supplier@example.com" },
    payment_terms: "prepaid",
    min_order_cents: 10_000,
    currency: CURRENCY,
    notes: `Managed bootstrap fixture for ${target}.`,
    active: true,
  });
  await upsert(client, "purchase_orders", {
    id: FIXTURE_IDS.purchaseOrder,
    supplier_id: FIXTURE_IDS.supplier,
    status: "draft",
    currency: CURRENCY,
    placed_at: null,
    expected_at: dates.expectedAt,
    total_cents: 15_000,
    notes: "Bootstrap purchase order fixture.",
  });
  await upsert(client, "purchase_order_items", {
    id: FIXTURE_IDS.purchaseOrderItem,
    purchase_order_id: FIXTURE_IDS.purchaseOrder,
    sku_id: FIXTURE_IDS.sku,
    quantity: 2,
    unit_cost_cents: 7_500,
    received_quantity: 0,
  });
}

async function seedCustomerAndCommerce(client, customerUser, customerEmail, target, now) {
  const address = {
    recipientName: "Bootstrap Customer",
    line1: "1 Test Data Way",
    line2: "",
    city: "Singapore",
    postalCode: "018989",
    countryCode: "SG",
  };
  const customer = await upsertAndSelect(
    client,
    "customers",
    {
      auth_user_id: customerUser.id,
      email: customerEmail,
      name: "Bootstrap Customer",
      phone: "+6590000000",
      segment: "collector",
      default_currency: CURRENCY,
      marketing_opt_in: false,
      provisioning_state: "active",
      provisioning_error: null,
    },
    "auth_user_id",
    "id"
  );

  await upsert(client, "preorders", {
    id: FIXTURE_IDS.preorder,
    customer_id: customer.id,
    sku_id: FIXTURE_IDS.sku,
    channel: "b2c",
    quantity: 1,
    unit_price_cents: PRICE_CENTS,
    deposit_cents: PRICE_CENTS,
    balance_cents: 0,
    currency: CURRENCY,
    status: "paid",
    allocated_qty: 0,
    order_id: null,
    notes: "Bootstrap fully-paid preorder fixture.",
  });
  await upsert(client, "orders", {
    id: FIXTURE_IDS.order,
    customer_id: customer.id,
    channel: "b2c",
    status: "paid",
    currency: CURRENCY,
    subtotal_cents: PRICE_CENTS,
    discount_cents: 0,
    discount_bps: 0,
    shipping_cents: 0,
    tax_cents: 1_643,
    total_cents: PRICE_CENTS,
    placed_at: now.toISOString(),
    shipping_address: address,
    shipping_service: "Bootstrap delivery",
    shipping_policy_key: "bootstrap_fixture",
  });
  await upsert(client, "order_items", {
    id: FIXTURE_IDS.orderItem,
    order_id: FIXTURE_IDS.order,
    sku_id: FIXTURE_IDS.sku,
    preorder_id: null,
    quantity: 1,
    unit_price_cents: PRICE_CENTS,
  });
  await upsert(
    client,
    "payments",
    {
      id: FIXTURE_IDS.orderPayment,
      order_id: FIXTURE_IDS.order,
      preorder_id: null,
      provider: "bootstrap",
      provider_payment_id: `bootstrap-order-${target}`,
      kind: "full",
      amount_cents: PRICE_CENTS,
      currency: CURRENCY,
      status: "captured",
      captured_at: now.toISOString(),
    },
    "provider,provider_payment_id"
  );
  await upsert(
    client,
    "payments",
    {
      id: FIXTURE_IDS.preorderPayment,
      order_id: null,
      preorder_id: FIXTURE_IDS.preorder,
      provider: "bootstrap",
      provider_payment_id: `bootstrap-preorder-${target}`,
      kind: "full",
      amount_cents: PRICE_CENTS,
      currency: CURRENCY,
      status: "captured",
      captured_at: now.toISOString(),
    },
    "provider,provider_payment_id"
  );
  await upsert(client, "refunds", {
    id: FIXTURE_IDS.refund,
    payment_id: FIXTURE_IDS.orderPayment,
    provider_refund_id: `bootstrap-refund-${target}`,
    amount_cents: 100,
    currency: CURRENCY,
    reason: "Bootstrap pending refund fixture.",
    status: "pending",
  });
  await upsert(client, "shipments", {
    id: FIXTURE_IDS.shipment,
    order_id: FIXTURE_IDS.order,
    carrier: "Bootstrap Carrier",
    tracking_number: `BOOTSTRAP-${target.toUpperCase()}`,
    status: "pending",
    address,
    shipped_at: null,
    delivered_at: null,
  });
  await upsert(client, "allocation_rules", {
    id: FIXTURE_IDS.allocationRule,
    set_id: null,
    sku_id: FIXTURE_IDS.sku,
    channel: "b2c",
    priority: 100,
    reserve_quantity: 0,
    max_per_customer: 4,
    active: true,
  });
  await upsert(client, "notifications", {
    id: FIXTURE_IDS.notification,
    customer_id: customer.id,
    channel: "email",
    template: "bootstrap_fixture",
    payload: { target, sku: SKU },
    status: "queued",
    provider: null,
    provider_message_id: null,
    dedupe_key: `bootstrap-notification-${target}`,
    sent_at: null,
    error: null,
  });
  await upsert(
    client,
    "webhook_events",
    {
      id: FIXTURE_IDS.webhookEvent,
      provider: "bootstrap",
      event_id: `bootstrap-event-${target}`,
      event_type: "bootstrap.completed",
      payload: { target, productId: FIXTURE_IDS.product },
      processed_at: now.toISOString(),
    },
    "provider,event_id"
  );
  await upsert(client, "payment_exceptions", {
    id: FIXTURE_IDS.paymentException,
    order_id: FIXTURE_IDS.order,
    payment_id: FIXTURE_IDS.orderPayment,
    exception_type: "manual_flag",
    severity: "info",
    status: "resolved",
    detail: "Resolved bootstrap reconciliation fixture.",
    actor: `bootstrap:${target}`,
    resolved_at: now.toISOString(),
  });
  await upsert(
    client,
    "waitlist_entries",
    {
      id: FIXTURE_IDS.waitlist,
      customer_id: customer.id,
      sku_id: FIXTURE_IDS.sku,
      channel: "email",
      contact: customerEmail,
      status: "active",
      notified_at: null,
    },
    "customer_id,sku_id,channel"
  );

  return customer.id;
}

async function seedServerLedgers(client, actorId, target, now, dates) {
  const bucketKey = `bootstrap:${target}:rate-limit`;
  await upsert(
    client,
    "api_rate_limit_buckets",
    {
      bucket_key: bucketKey,
      window_started_at: now.toISOString(),
      request_count: 0,
      expires_at: dates.expiredAt,
    },
    "bucket_key"
  );
  const consumed = await rpc(client, "consume_api_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: 10,
    p_window_seconds: 3600,
  });
  const result = one(consumed);
  if (!result?.allowed || Number(result.remaining) !== 9) {
    throw new Error("API rate-limit smoke test did not consume the isolated bootstrap bucket");
  }

  await upsert(
    client,
    "api_idempotency_records",
    {
      id: FIXTURE_IDS.idempotency,
      scope: `bootstrap.${target}`,
      actor_id: actorId,
      idempotency_key_hash: IDEMPOTENCY_KEY_HASH,
      request_hash: IDEMPOTENCY_REQUEST_HASH,
      status: "processing",
      response_status: null,
      response_body: null,
      locked_at: now.toISOString(),
      expires_at: dates.ledgerExpiresAt,
      updated_at: now.toISOString(),
    },
    "scope,actor_id,idempotency_key_hash"
  );
  await rpc(client, "complete_api_idempotency", {
    p_scope: `bootstrap.${target}`,
    p_actor_id: actorId,
    p_idempotency_key_hash: IDEMPOTENCY_KEY_HASH,
    p_request_hash: IDEMPOTENCY_REQUEST_HASH,
    p_response_status: 200,
    p_response_body: { ok: true, fixture: "database-bootstrap", target },
  });
}

async function exerciseAdminMutationApis(client, actorAuthUserId, dates) {
  await rpc(client, "admin_upsert_category", {
    p_category_id: FIXTURE_IDS.category,
    p_parent_id: null,
    p_slug: CATEGORY.slug,
    p_name: CATEGORY.name,
    p_publisher: CATEGORY.publisher,
    p_description: CATEGORY.description,
    p_sort_order: CATEGORY.sortOrder,
    p_active: true,
    p_actor_auth_user_id: actorAuthUserId,
  });
  await rpc(client, "admin_upsert_set_release", {
    p_set_id: FIXTURE_IDS.set,
    p_category_id: FIXTURE_IDS.category,
    p_name: RELEASE.name,
    p_code: RELEASE.code,
    p_description: RELEASE.description,
    p_release_date: dates.releaseDate,
    p_preorder_open_at: null,
    p_preorder_close_at: null,
    p_status: "released",
    p_sort_order: 999,
    p_active: true,
    p_actor_auth_user_id: actorAuthUserId,
  });
  await rpc(client, "admin_upsert_catalog_product", {
    p_product_id: FIXTURE_IDS.product,
    p_name: PRODUCT_NAME,
    p_category_id: FIXTURE_IDS.category,
    p_set_id: FIXTURE_IDS.set,
    p_product_type: PRODUCT_TYPE.code,
    p_description:
      "Visible bootstrap fixture. Its publication, active price, and sellable stock verify the storefront contract.",
    p_language: "EN",
    p_image_url: null,
    p_active: true,
    p_actor: `staff:${actorAuthUserId}`,
  });
  await rpc(client, "admin_upsert_catalog_sku", {
    p_sku_id: FIXTURE_IDS.sku,
    p_product_id: FIXTURE_IDS.product,
    p_sku: SKU,
    p_barcode: "888800000001",
    p_packs_per_box: 24,
    p_cards_per_pack: 12,
    p_weight_grams: 900,
    p_active: true,
    p_actor_auth_user_id: actorAuthUserId,
  });
  await rpc(client, "admin_set_sku_price", {
    p_sku_id: FIXTURE_IDS.sku,
    p_currency: CURRENCY,
    p_price_cents: PRICE_CENTS,
    p_compare_at_cents: COMPARE_AT_CENTS,
    p_actor_auth_user_id: actorAuthUserId,
  });
  await rpc(client, "admin_upsert_supplier", {
    p_supplier_id: FIXTURE_IDS.supplier,
    p_name: "Bootstrap Test Distributor",
    p_supplier_type: "distributor",
    p_region: "SG",
    p_contact: { email: "bootstrap-supplier@example.com" },
    p_payment_terms: "prepaid",
    p_min_order_cents: 10_000,
    p_currency: CURRENCY,
    p_notes: "Managed bootstrap fixture.",
    p_active: true,
    p_actor_auth_user_id: actorAuthUserId,
  });
  await rpc(client, "admin_upsert_storefront_listing", {
    p_product_id: FIXTURE_IDS.product,
    p_title_override: PRODUCT_NAME,
    p_badge_label: "Test data",
    p_tags: ["bootstrap", "api-smoke-test"],
    p_max_per_customer: 4,
    p_preorder_reserve: 0,
    p_sort_priority: 999,
    p_featured: true,
    p_availability_mode: "available_now",
    p_order_open_at: null,
    p_order_close_at: null,
    p_release_date: dates.releaseDate,
    p_actor_auth_user_id: actorAuthUserId,
  });
  await rpc(client, "admin_upsert_pricing_promotion", {
    p_deal_id: FIXTURE_IDS.deal,
    p_code: "bootstrap_launch",
    p_sku_id: FIXTURE_IDS.sku,
    p_title: "Bootstrap launch offer",
    p_description: "API-managed public promotion fixture.",
    p_deal_price_cents: DEAL_PRICE_CENTS,
    p_visibility: "public",
    p_starts_at: dates.startsAt,
    p_ends_at: dates.endsAt,
    p_sort_priority: 999,
    p_active: true,
    p_actor_auth_user_id: actorAuthUserId,
  });
  await rpc(client, "admin_set_listing_publication", {
    p_product_id: FIXTURE_IDS.product,
    p_published: true,
    p_actor_auth_user_id: actorAuthUserId,
  });
}

async function verifyCompletedIdempotency(client, actorId) {
  const { data, error } = await client
    .from("api_idempotency_records")
    .select("status,response_status,response_body")
    .eq("scope", `bootstrap.${process.env.TARGET_ENV}`)
    .eq("actor_id", actorId)
    .eq("idempotency_key_hash", IDEMPOTENCY_KEY_HASH)
    .single();
  if (error) throw new Error(`Idempotency verification failed: ${error.message}`);
  if (
    data.status !== "completed" ||
    data.response_status !== 200 ||
    data.response_body?.ok !== true
  ) {
    throw new Error("Idempotency completion API did not persist the bootstrap response");
  }
}

async function verifySecretRead(client) {
  const { data: product, error: productError } = await client
    .from("products")
    .select(
      "id,slug,name,active,product_variants(booster_box_skus(id,active,sku_prices(active,price_cents,starts_at,ends_at),inventory(on_hand,allocated,safety_stock)))"
    )
    .eq("id", FIXTURE_IDS.product)
    .single();
  if (productError) {
    throw new Error(`Bootstrap product verification query failed: ${productError.message}`);
  }

  const { data: listing, error: listingError } = await client
    .from("listing_items")
    .select("published,availability_mode")
    .eq("product_id", FIXTURE_IDS.product)
    .single();
  if (listingError) {
    throw new Error(`Bootstrap listing verification query failed: ${listingError.message}`);
  }

  const { data: deal, error: dealError } = await client
    .from("limited_time_deals")
    .select("active,deal_price_cents")
    .eq("id", FIXTURE_IDS.deal)
    .single();
  if (dealError) throw new Error(`Bootstrap deal verification query failed: ${dealError.message}`);

  const variant = one(product.product_variants);
  const sku = one(variant?.booster_box_skus);
  const activePrice = (sku?.sku_prices ?? []).find((price) => price.active);
  const inventory = one(sku?.inventory);
  if (
    !product.active ||
    !listing.published ||
    listing.availability_mode !== "available_now" ||
    !sku?.active ||
    !activePrice ||
    Number(activePrice.price_cents) <= 0 ||
    !deal.active ||
    Number(deal.deal_price_cents) !== DEAL_PRICE_CENTS ||
    Number(deal.deal_price_cents) >= Number(activePrice.price_cents) ||
    Number(inventory?.on_hand ?? 0) - Number(inventory?.allocated ?? 0) <=
      Number(inventory?.safety_stock ?? 0)
  ) {
    throw new Error("Bootstrap product does not satisfy the storefront visibility contract");
  }
  return product;
}

async function verifyAnonymousRead(supabaseUrl, publishableKey) {
  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: product, error: productError } = await publicClient
    .from("products")
    .select("id,slug")
    .eq("id", FIXTURE_IDS.product)
    .single();
  if (productError) {
    throw new Error(`Anonymous product read failed: ${productError.message}`);
  }

  const { data: listing, error: listingError } = await publicClient
    .from("listing_items")
    .select("published,availability_mode")
    .eq("product_id", FIXTURE_IDS.product)
    .single();
  if (listingError) {
    throw new Error(`Anonymous listing read failed: ${listingError.message}`);
  }

  const { data: deal, error: dealError } = await publicClient
    .from("limited_time_deals")
    .select("deal_price_cents")
    .eq("id", FIXTURE_IDS.deal)
    .single();
  if (dealError) throw new Error(`Anonymous deal read failed: ${dealError.message}`);
  if (
    !product ||
    !listing.published ||
    listing.availability_mode !== "available_now" ||
    Number(deal.deal_price_cents) !== DEAL_PRICE_CENTS
  ) {
    throw new Error("Anonymous storefront read did not return the exact bootstrap deal price");
  }
}

const HOSTED_FETCH_ATTEMPTS = 5;
const HOSTED_FETCH_TIMEOUT_MS = 15_000;

async function verifyHostedStorefront(siteUrl, productSlug, vercelBypassSecret) {
  const base = new URL(siteUrl);
  const headers = { "user-agent": "marketplace-database-bootstrap/1.0" };
  if (vercelBypassSecret) {
    headers["x-vercel-protection-bypass"] = vercelBypassSecret;
  }

  const catalogResponse = await fetchHostedPage(
    new URL("/products", base),
    headers,
    "Hosted catalog"
  );
  if (!catalogResponse.ok) {
    throw new Error(`Hosted catalog verification failed with HTTP ${catalogResponse.status}`);
  }
  const catalogHtml = await catalogResponse.text();
  if (!catalogHtml.includes(PRODUCT_NAME) && !catalogHtml.includes(productSlug)) {
    throw new Error("Hosted catalog did not render the bootstrap product");
  }

  const detailResponse = await fetchHostedPage(
    new URL(`/products/${productSlug}`, base),
    headers,
    "Hosted product"
  );
  if (!detailResponse.ok) {
    throw new Error(`Hosted product verification failed with HTTP ${detailResponse.status}`);
  }
}

async function fetchHostedPage(url, headers, label) {
  let lastError;
  for (let attempt = 1; attempt <= HOSTED_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(HOSTED_FETCH_TIMEOUT_MS),
      });
      if (response.ok || attempt === HOSTED_FETCH_ATTEMPTS) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === HOSTED_FETCH_ATTEMPTS) break;
    }
    await delay(attempt * 2_000);
  }
  throw new Error(
    `${label} fetch failed after ${HOSTED_FETCH_ATTEMPTS} attempts for ${url.hostname}: ${describeError(lastError)}`
  );
}

function describeError(error) {
  if (!(error instanceof Error)) return String(error);
  const details = [];
  let current = error;
  while (current) {
    if (current instanceof Error) {
      if (current.message) details.push(current.message);
      if (current.code) details.push(String(current.code));
      current = current.cause;
    } else {
      details.push(String(current));
      break;
    }
  }
  return [...new Set(details)].join(": ") || "unknown error";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function ensureAuthUser(client, email, fullName) {
  const existing = await findAuthUser(client, email);
  if (existing) return existing;

  const { data, error } = await client.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: fullName, fixture: "database-bootstrap" },
    app_metadata: { fixture: "database-bootstrap" },
  });
  if (error) {
    const afterConflict = await findAuthUser(client, email);
    if (afterConflict) return afterConflict;
    throw new Error(`Could not create bootstrap auth user ${email}: ${error.message}`);
  }
  if (!data.user) throw new Error(`Supabase did not return the created bootstrap user ${email}`);
  return data.user;
}

async function findAuthUser(client, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list Supabase auth users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  throw new Error(`Could not resolve bootstrap auth user ${email} within the bounded user scan`);
}

async function upsert(client, table, row, onConflict = "id") {
  const { error } = await client.from(table).upsert(row, { onConflict, ignoreDuplicates: false });
  if (error) throw new Error(`Upsert failed for ${table}: ${error.message}`);
}

async function upsertMany(client, table, rows, onConflict) {
  if (rows.length === 0) throw new Error(`No rows were supplied for required table ${table}`);
  const { error } = await client.from(table).upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) throw new Error(`Upsert failed for ${table}: ${error.message}`);
}

async function upsertAndSelect(client, table, row, onConflict, columns) {
  const { data, error } = await client
    .from(table)
    .upsert(row, { onConflict, ignoreDuplicates: false })
    .select(columns)
    .single();
  if (error) throw new Error(`Upsert failed for ${table}: ${error.message}`);
  return data;
}

async function deleteWhere(client, table, column, value) {
  const { error } = await client.from(table).delete().eq(column, value);
  if (error) throw new Error(`Fixture cleanup failed for ${table}: ${error.message}`);
}

async function selectColumn(client, table, column) {
  const { data, error } = await client.from(table).select(column);
  if (error) throw new Error(`Read failed for ${table}.${column}: ${error.message}`);
  return data.map((row) => row[column]);
}

async function verifyReferenceRow(client, table, column, value) {
  const { data, error } = await client.from(table).select(column).eq(column, value).maybeSingle();
  if (error) throw new Error(`Reference-data verification failed for ${table}: ${error.message}`);
  if (!data) throw new Error(`Required migration-owned reference row is missing from ${table}`);
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`API smoke test ${name} failed: ${error.message}`);
  return data;
}

async function assertManifestCoversMigrations() {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const filenames = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const sqlByFilename = Object.fromEntries(
    await Promise.all(
      filenames.map(async (filename) => [
        filename,
        await readFile(new URL(filename, directory), "utf8"),
      ])
    )
  );
  const coverage = compareBootstrapCoverage(discoverActivePublicTables(sqlByFilename));
  if (coverage.missing.length || coverage.stale.length) {
    throw new Error(
      [
        "Database bootstrap manifest does not match the active public schema.",
        coverage.missing.length ? `Missing handlers: ${coverage.missing.join(", ")}` : null,
        coverage.stale.length ? `Stale handlers: ${coverage.stale.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
}

function parseTarget(args, environmentTarget) {
  const positional = args.find((argument) => !argument.startsWith("--"));
  const targetFlag = args.find((argument) => argument.startsWith("--target="));
  const target = (targetFlag?.split("=")[1] || positional || environmentTarget || "").trim();
  if (!DATABASE_BOOTSTRAP_TARGETS.includes(target)) {
    throw new Error(
      `Database bootstrap target must be one of: ${DATABASE_BOOTSTRAP_TARGETS.join(", ")}`
    );
  }
  return target;
}

export function assertTargetSafety(target, supabaseUrl) {
  if (target === "production") throw new Error("Production database bootstrap is prohibited");
  const databaseHost = new URL(supabaseUrl).hostname.toLowerCase();
  if (/(?:^|[.-])prod(?:uction)?(?:[.-]|$)/.test(databaseHost)) {
    throw new Error(
      `Refusing to bootstrap ${target} with a production-looking database URL`
    );
  }
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for database bootstrap`);
  return value;
}

function one(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function appendGithubSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const { appendFile } = await import("node:fs/promises");
  await appendFile(
    summaryPath,
    [
      "## Database bootstrap",
      "",
      `- Target: \`${summary.target}\``,
      `- Product: \`${summary.productSlug}\``,
      `- SKU: \`${summary.sku}\``,
      `- Deal price: ${summary.dealPriceCents} cents`,
      `- Public tables covered: ${summary.publicTablesCovered}`,
      `- Anonymous read: ${summary.anonymousReadVerified ? "verified" : "skipped"}`,
      `- Hosted storefront: ${summary.hostedStorefrontVerified ? "verified" : "skipped"}`,
      "",
    ].join("\n")
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
