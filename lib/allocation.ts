export interface AllocationRule {
  priority: number;
  channel: "b2c";
  reserveQuantity: number;
  maxPerCustomer: number | null;
}

export interface PendingPreorder {
  preorderId: string;
  customerId: string;
  channel: "b2c";
  quantity: number;
  position: number;
}

export interface AllocationResult {
  preorderId: string;
  allocated: number;
}

export function allocate(
  available: number,
  rules: AllocationRule[],
  preorders: PendingPreorder[]
): AllocationResult[] {
  const results = new Map<string, number>();
  let remaining = available;
  const orderedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const remainingByPreorder = new Map(preorders.map((preorder) => [preorder.preorderId, preorder.quantity]));

  for (const rule of orderedRules) {
    if (remaining <= 0) break;
    let budget = rule.reserveQuantity > 0 ? Math.min(rule.reserveQuantity, remaining) : remaining;
    const perCustomer = new Map<string, number>();
    const queue = preorders
      .filter((preorder) => preorder.channel === rule.channel)
      .sort((a, b) => a.position - b.position);

    for (const preorder of queue) {
      if (budget <= 0 || remaining <= 0) break;
      const outstanding = remainingByPreorder.get(preorder.preorderId) ?? 0;
      if (outstanding <= 0) continue;

      let allocation = Math.min(outstanding, budget, remaining);
      if (rule.maxPerCustomer !== null) {
        const alreadyAllocated = perCustomer.get(preorder.customerId) ?? 0;
        allocation = Math.min(
          allocation,
          Math.max(0, rule.maxPerCustomer - alreadyAllocated)
        );
      }
      if (allocation <= 0) continue;

      results.set(preorder.preorderId, (results.get(preorder.preorderId) ?? 0) + allocation);
      remainingByPreorder.set(preorder.preorderId, outstanding - allocation);
      perCustomer.set(
        preorder.customerId,
        (perCustomer.get(preorder.customerId) ?? 0) + allocation
      );
      budget -= allocation;
      remaining -= allocation;
    }
  }

  return [...results.entries()].map(([preorderId, allocated]) => ({ preorderId, allocated }));
}
