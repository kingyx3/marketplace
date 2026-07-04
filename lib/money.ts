export function formatMoney(cents: number, currency = "SGD"): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function stripeCurrency(currency: string): string {
  return currency.toLowerCase();
}
