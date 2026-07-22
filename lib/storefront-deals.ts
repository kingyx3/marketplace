import type { LimitedTimeDeal } from "@/lib/deals";

export function indexBestDealsByProduct(deals: LimitedTimeDeal[]): Map<string, LimitedTimeDeal> {
  const indexed = new Map<string, LimitedTimeDeal>();

  for (const deal of deals) {
    const current = indexed.get(deal.referenceCode);
    if (!current || isBetterDeal(deal, current)) {
      indexed.set(deal.referenceCode, deal);
    }
  }

  return indexed;
}

function isBetterDeal(candidate: LimitedTimeDeal, current: LimitedTimeDeal): boolean {
  if (candidate.dealPriceCents !== current.dealPriceCents) {
    return candidate.dealPriceCents < current.dealPriceCents;
  }

  return new Date(candidate.endsAt).getTime() < new Date(current.endsAt).getTime();
}
