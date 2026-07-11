#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredUrl("STAGING_APP_URL");
const supabaseUrl = requiredUrl("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const secretKey = required("SUPABASE_SECRET_KEY");
const runId = randomUUID();
const password = `Hosted-${runId}-Aa1!`;
const prefix = `release-gate-${runId}`;

const service = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fixtures = {
  users: [],
  customers: [],
  orders: [],
  staff: [],
};

try {
  const customerA = await createTestIdentity("customer-a");
  const customerB = await createTestIdentity("customer-b");
  const activeStaff = await createTestIdentity("active-staff");
  const inactiveStaff = await createTestIdentity("inactive-staff");

  const customerARow = await customerForUser(customerA.user.id);
  const customerBRow = await customerForUser(customerB.user.id);
  fixtures.customers.push(customerARow.id, customerBRow.id);

  const { data: staffRows, error: staffError } = await service
    .from("staff_users")
    .insert([
      { auth_user_id: activeStaff.user.id, role: "admin", active: true },
      { auth_user_id: inactiveStaff.user.id, role: "admin", active: false },
    ])
    .select("id, auth_user_id, active");
  assertNoError(staffError, "create staff fixtures");
  fixtures.staff.push(...(staffRows ?? []).map((row) => row.id));

  const { data: orderRows, error: orderError } = await service
    .from("orders")
    .insert([
      {
        customer_id: customerARow.id,
        status: "pending_payment",
        currency: "SGD",
        subtotal_cents: 1000,
        shipping_cents: 0,
        tax_cents: 83,
        total_cents: 1000,
        placed_at: new Date().toISOString(),
      },
      {
        customer_id: customerBRow.id,
        status: "pending_payment",
        currency: "SGD",
        subtotal_cents: 2000,
        shipping_cents: 0,
        tax_cents: 165,
        total_cents: 2000,
        placed_at: new Date().toISOString(),
      },
    ])
    .select("id, customer_id");
  assertNoError(orderError, "create order fixtures");
  assert(orderRows?.length === 2, "expected two order fixtures");
  fixtures.orders.push(...orderRows.map((row) => row.id));

  await verifyAnonymousAccess();
  await verifyCustomerIsolation(customerA, customerARow, customerBRow, orderRows);
  await verifyCustomerIsolation(customerB, customerBRow, customerARow, orderRows);
  await verifyStaffRevocation(activeStaff, inactiveStaff);

  console.log("Hosted Supabase Auth, RLS, object isolation, and staff revocation checks passed.");
} finally {
  await cleanup();
}

async function createTestIdentity(label) {
  const email = `${prefix}-${label}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Release Gate ${label}` },
  });
  assertNoError(error, `create ${label} auth user`);
  assert(data.user, `${label} auth user was not returned`);
  fixtures.users.push(data.user.id);
  return { user: data.user, email };
}

async function customerForUser(userId) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const { data, error } = await service
      .from("customers")
      .select("id, auth_user_id, email, name")
      .eq("auth_user_id", userId)
      .maybeSingle();
    assertNoError(error, "read provisioned customer");
    if (data) return data;
    await sleep(attempt * 150);
  }
  throw new Error(`customer provisioning did not complete for ${userId}`);
}

async function verifyAnonymousAccess() {
  const catalog = await anon.from("products").select("id").limit(1);
  assertNoError(catalog.error, "anonymous catalog read");

  const orders = await anon.from("orders").select("id");
  assertNoError(orders.error, "anonymous order read");
  assert((orders.data ?? []).length === 0, "anonymous user could read orders");

  const customers = await anon.from("customers").select("id");
  assertNoError(customers.error, "anonymous customer read");
  assert((customers.data ?? []).length === 0, "anonymous user could read customers");

  const audit = await anon.from("audit_logs").select("id").limit(1);
  assert(
    Boolean(audit.error) || (audit.data ?? []).length === 0,
    "anonymous user could read audit logs"
  );
}

async function verifyCustomerIsolation(identity, ownCustomer, otherCustomer, orderRows) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email: identity.email,
    password,
  });
  assertNoError(signInError, `sign in ${identity.email}`);
  assert(session.session?.access_token, `missing access token for ${identity.email}`);

  const profile = await client.from("customers").select("id, auth_user_id, email");
  assertNoError(profile.error, "customer profile read");
  assert(profile.data?.length === 1, "customer could read more than one profile");
  assert(profile.data[0].id === ownCustomer.id, "customer read another profile");

  const orders = await client.from("orders").select("id, customer_id");
  assertNoError(orders.error, "customer order read");
  assert(orders.data?.length === 1, "customer could read more than one order");
  assert(orders.data[0].customer_id === ownCustomer.id, "customer read another order");

  const otherOrder = orderRows.find((row) => row.customer_id === otherCustomer.id);
  const directOtherOrder = await client.from("orders").select("id").eq("id", otherOrder.id);
  assertNoError(directOtherOrder.error, "direct foreign order read");
  assert((directOtherOrder.data ?? []).length === 0, "customer bypassed order ownership RLS");

  const ownUpdate = await client
    .from("customers")
    .update({ name: `Verified ${runId}` })
    .eq("id", ownCustomer.id)
    .select("id, name");
  assertNoError(ownUpdate.error, "own profile update");
  assert(ownUpdate.data?.length === 1, "own profile update was not applied");

  const foreignUpdate = await client
    .from("customers")
    .update({ name: "RLS violation" })
    .eq("id", otherCustomer.id)
    .select("id");
  assertNoError(foreignUpdate.error, "foreign profile update");
  assert((foreignUpdate.data ?? []).length === 0, "customer updated another profile");

  const insertOrder = await client.from("orders").insert({
    customer_id: ownCustomer.id,
    status: "draft",
    subtotal_cents: 1,
    total_cents: 1,
    currency: "SGD",
  });
  assert(Boolean(insertOrder.error), "customer inserted an order outside the service workflow");

  const staffRows = await client.from("staff_users").select("id");
  assert(
    Boolean(staffRows.error) || (staffRows.data ?? []).length === 0,
    "customer could read staff authorization records"
  );
}

async function verifyStaffRevocation(activeStaff, inactiveStaff) {
  const activeToken = await accessToken(activeStaff);
  const inactiveToken = await accessToken(inactiveStaff);

  const activeResponse = await fetch(new URL("/api/admin/orders?limit=1", appUrl), {
    headers: { Authorization: `Bearer ${activeToken}`, Accept: "application/json" },
  });
  assert(activeResponse.status === 200, `active staff admin API returned ${activeResponse.status}`);

  const inactiveResponse = await fetch(new URL("/api/admin/orders?limit=1", appUrl), {
    headers: { Authorization: `Bearer ${inactiveToken}`, Accept: "application/json" },
  });
  assert(
    inactiveResponse.status === 403,
    `deactivated staff admin API returned ${inactiveResponse.status}, expected 403`
  );
}

async function accessToken(identity) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: identity.email,
    password,
  });
  assertNoError(error, `sign in ${identity.email}`);
  assert(data.session?.access_token, `missing access token for ${identity.email}`);
  return data.session.access_token;
}

async function cleanup() {
  if (fixtures.orders.length > 0) {
    await service.from("payments").delete().in("order_id", fixtures.orders);
    await service.from("shipments").delete().in("order_id", fixtures.orders);
    await service.from("order_items").delete().in("order_id", fixtures.orders);
    await service.from("orders").delete().in("id", fixtures.orders);
  }
  if (fixtures.staff.length > 0) {
    await service.from("staff_users").delete().in("id", fixtures.staff);
  }
  if (fixtures.customers.length > 0) {
    await service.from("notifications").delete().in("customer_id", fixtures.customers);
    await service.from("b2b_accounts").delete().in("customer_id", fixtures.customers);
    await service.from("customers").delete().in("id", fixtures.customers);
  }
  for (const userId of fixtures.users.reverse()) {
    await service.auth.admin.deleteUser(userId);
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredUrl(name) {
  const value = required(name);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function assertNoError(error, operation) {
  if (error) throw new Error(`${operation} failed: ${error.message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
