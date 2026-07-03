/**
 * Pre-order allocation engine (pure logic, unit-tested).
 *
 * When incoming stock for a SKU is confirmed, allocation rules decide
 * which pre-orders get filled first. Rules are ordered by `priority`
 * (lower number = allocated first) and may reserve quantity for a
 * channel (e.g. keep 20% of a hot box for B2C even if B2B demand
 * exceeds supply) and cap quantity per customer.
 *
 * Mirrors the `allocation_rules` table; see docs/data-model.md.
 */

export interface AllocationRule {
  /** Lower runs first. */
  priority: number;
  /** Which sales channel this rule allocates to. */
  channel: "b2c" | "b2b";
  /** Units reserved for this rule's channel (0 = no reserve, take what's left). */
  reserveQuantity: number;
  /** Per-customer cap within this rule (null = uncapped). */
  maxPerCustomer: number | null;
}

export interface PendingPreorder {
  preorderId: string;
  customerId: string;
  channel: "b2c" | "b2b";
  quantity: number;
  /** Earlier pre-orders are filled first within a rule (FIFO). */
  position: number;
}

export interface AllocationResult {
  preorderId: string;
  allocated: number;
}

/**
 * Allocate `available` units across pending pre-orders according to rules.
 * Deterministic: rules by priority, then pre-orders FIFO by position.
 * Never over-allocates; partial fills are allowed.
 */
export function allocate(
  available: number,
  rules: AllocationRule[],
  preorders: PendingPreorder[]
): AllocationResult[] {
  const results = new Map<string, number>();
  let remaining = available;

  const orderedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const remainingByPreorder = new Map(preorders.map((p) => [p.preorderId, p.quantity]));

  for (const rule of orderedRules) {
    if (remaining <= 0) break;
    // A reserve carves out budget for this rule; 0 means "whatever is left".
    let budget = rule.reserveQuantity > 0 ? Math.min(rule.reserveQuantity, remaining) : remaining;

    const perCustomer = new Map<string, number>();
    const queue = preorders
      .filter((p) => p.channel === rule.channel)
      .sort((a, b) => a.position - b.position);

    for (const p of queue) {
      if (budget <= 0 || remaining <= 0) break;
      const outstanding = remainingByPreorder.get(p.preorderId) ?? 0;
      if (outstanding <= 0) continue;

      let cap = Math.min(outstanding, budget, remaining);
      if (rule.maxPerCustomer !== null) {
        const already = perCustomer.get(p.customerId) ?? 0;
        cap = Math.min(cap, Math.max(0, rule.maxPerCustomer - already));
      }
      if (cap <= 0) continue;

      results.set(p.preorderId, (results.get(p.preorderId) ?? 0) + cap);
      remainingByPreorder.set(p.preorderId, outstanding - cap);
      perCustomer.set(p.customerId, (perCustomer.get(p.customerId) ?? 0) + cap);
      budget -= cap;
      remaining -= cap;
    }
  }

  return [...results.entries()].map(([preorderId, allocated]) => ({ preorderId, allocated }));
}
