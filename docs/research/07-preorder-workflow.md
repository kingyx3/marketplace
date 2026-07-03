# 07 — Pre-order workflow design

Pre-orders are the highest-margin, lowest-inventory-risk model
available to this business ([§03](03-business-model.md)), so the
workflow deserves more design care than a generic "buy now" cart. This
section is the business logic behind `preorders`, `payments`, and
`allocation_rules` in the schema ([§09](09-data-model.md)).

## Deposit vs. full payment

**Recommendation: deposit + balance, not full payment upfront**, for
three reasons:

1. It matches how the category's own supply chain works — distributors
   themselves don't guarantee quantity until closer to release and
   reserve the right to allocate **[S3]** — so promising a customer a
   *guaranteed* box for full payment months out overstates certainty
   the business doesn't have.
2. It lowers the customer's commitment barrier for high-ticket
   Collector Booster-tier product, where pre-sale prices can run well
   above MSRP (the LotR case: ~US$434.80 pre-sale vs ~US$280
   distributor cost — **[S4]**).
3. It mechanically funds the purchase: a deposit collected before the
   distributor invoice is due is working capital, without becoming
   full pre-payment risk if the order later needs to be cancelled or
   cut.

**Implementation:** Stripe PaymentIntent with `capture_method: manual`
— authorize the deposit at order time, capture at allocation
confirmation, and the *balance* is a second PaymentIntent (or a second
capture request) triggered when the pre-order moves to `balance_due`.
This is what `lib/stripe.ts` and the `payments.kind` (`deposit` /
`balance` / `full`) column are built for.

## Allocation when supply is cut

Given that allocation risk is a standard, contractual term at the
distributor level **[S3]**, the business must have a *pre-committed,
published* policy rather than deciding ad hoc when a cut actually
happens — this is both an ethical commitment and the product feature
identified as a market gap in [§02](02-competitive-benchmarking.md).

Concrete policy shape (matches the seeded example in
`supabase/seed.sql`):

1. **Priority order, not first-come-first-served alone.** Reserve a
   fixed quantity for the direct-to-consumer channel even if wholesale
   demand would absorb all of it (`allocation_rules.channel = 'b2c'`
   with a `reserve_quantity`), so a handful of large wholesale orders
   can't crowd out the community the brand exists to serve.
2. **Per-customer caps** (`max_per_customer`) to blunt investor/flipper
   behavior identified in [§05](05-customer-segmentation.md).
3. **FIFO within a rule, by pre-order position, not by payment amount**
   — allocation should never be biased toward whoever paid the largest
   deposit; that would incentivize gaming the deposit amount rather
   than genuine early commitment.
4. **Publish the rule, not just the result.** Customers should be able
   to see (in plain language, on the product/pre-order page) that a
   reserve and cap policy exists, before they order — not just receive
   a surprise partial allocation after the fact.

## Refund policy

- **Full refund of the deposit if the pre-order is not allocated at
  all** (the business never received supply to fill it) — no
  discretion, no restocking fee; the customer committed capital in
  good faith to a promise the business couldn't keep.
- **Deposit is non-refundable once allocated and the balance is
  captured**, except for genuine defect/damage on arrival — standard
  practice, and necessary because an allocated unit is now committed
  inventory the business paid for on the customer's behalf.
- **Cancellation before allocation**: refund minus payment-processor
  fees actually incurred (Stripe doesn't refund its processing fee on a
  cancelled authorization that was never captured, so a pre-capture
  cancellation should in practice cost the business nothing — this is
  in fact one more argument for manual capture over immediate full
  charge).
- **Never release/ship pre-order product before official street date**
  — this isn't just good practice, it's a contractual requirement under
  at least one publisher's policy (FaB: no delivery before 12:01 AM
  local time on release day, "including online pre-orders and box
  breaks" **[S2]**) and should be assumed to generalize to other
  publishers' pre-order rules unless confirmed otherwise.

## Communication cadence

A minimum sequence, each mapped to a `notifications.template`:

1. **Pre-order confirmed** (deposit captured) — immediately.
2. **Allocation result** — as soon as the business knows its own
   incoming supply, ideally weeks before street date, not the day of.
   This is the single most trust-building message in the whole flow:
   silence during this window is what erodes confidence in every
   incumbent channel reviewed.
3. **Balance due** — with a clear deadline and consequence (e.g.
   "balance not paid by X will release your allocation to the
   waitlist") stated up front at order time, not sprung on the
   customer later.
4. **Shipped** — tracking number, carrier (see [§10](10-operations.md)).
5. **Post-delivery** — a lightweight review/feedback touchpoint; not
   strictly required for v1 but cheap to add once notification
   providers are wired up (`docs/build-plan.md` Phase 2).

Channel mix should lean on whichever channel the customer opted into at
signup — email is the default/fallback, but Telegram/WhatsApp are
worth prioritizing for the SEA player/collector audience specifically
(see [§11](11-go-to-market.md) on community channels).
