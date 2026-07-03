export type Channel = "b2c" | "b2b";

export type SetStatus =
  | "announced"
  | "preorder_open"
  | "preorder_closed"
  | "released"
  | "out_of_print";

export type MarketplaceProduct = {
  slug: string;
  name: string;
  game: string;
  publisher: string;
  setName: string;
  setCode: string;
  releaseDate: string;
  setStatus: SetStatus;
  productType: string;
  sku: string;
  language: string;
  priceCents: number;
  msrpCents: number | null;
  currency: string;
  packsPerBox: number;
  cardsPerPack: number;
  onHand: number;
  incoming: number;
  allocated: number;
  safetyStock: number;
  preorderReserve: number;
  maxPerCustomer: number | null;
  image: string;
  description: string;
  tags: string[];
  channels: Channel[];
};

export type CartLine = {
  productSlug: string;
  quantity: number;
  channel: Channel;
};

export type TimelineItem = {
  label: string;
  date: string;
  state: "complete" | "current" | "upcoming" | "error";
};

export type OrderSummary = {
  id: string;
  status: "paid" | "packing" | "shipped" | "delivered";
  placedAt: string;
  totalCents: number;
  currency: string;
  channel: Channel;
  itemCount: number;
  trackingNumber?: string;
  carrier?: string;
  lines: CartLine[];
  timeline: TimelineItem[];
};

export type PreorderSummary = {
  id: string;
  status: "deposited" | "allocated" | "balance_due" | "paid" | "converted";
  createdAt: string;
  productSlug: string;
  quantity: number;
  unitPriceCents: number;
  depositCents: number;
  balanceCents: number;
  currency: string;
  allocatedQty: number;
  position: number;
  channel: Channel;
  timeline: TimelineItem[];
};

export type AccessState = {
  key:
    | "unauthenticated"
    | "authenticated_unpaid"
    | "payment_pending"
    | "provisioning"
    | "active"
    | "error";
  label: string;
  detail: string;
  action: string;
  tone: "neutral" | "warning" | "info" | "success" | "danger";
};

const heroImage = "/images/sealed-tcg-hero.png";

export const marketplaceProducts: MarketplaceProduct[] = [
  {
    slug: "smp-play-booster-box",
    name: "Sample Standard Play Booster Box",
    game: "Magic: The Gathering",
    publisher: "Wizards of the Coast",
    setName: "Sample Standard Set",
    setCode: "SMP",
    releaseDate: "2026-08-01",
    setStatus: "preorder_open",
    productType: "Booster box",
    sku: "MTG-SMP-PBB-EN",
    language: "EN",
    priceCents: 19900,
    msrpCents: 22000,
    currency: "SGD",
    packsPerBox: 36,
    cardsPerPack: 14,
    onHand: 0,
    incoming: 24,
    allocated: 9,
    safetyStock: 2,
    preorderReserve: 8,
    maxPerCustomer: 2,
    image: heroImage,
    description:
      "A sealed play booster display for release-week drafting, collecting, and store allocation.",
    tags: ["Preorder", "B2C reserve", "Deposit eligible"],
    channels: ["b2c", "b2b"],
  },
  {
    slug: "prism-collector-booster-box",
    name: "Prism Rift Collector Booster Box",
    game: "Pokemon TCG",
    publisher: "The Pokemon Company",
    setName: "Prism Rift",
    setCode: "PRI",
    releaseDate: "2026-09-18",
    setStatus: "announced",
    productType: "Collector box",
    sku: "PKM-PRI-CBB-EN",
    language: "EN",
    priceCents: 32900,
    msrpCents: null,
    currency: "SGD",
    packsPerBox: 12,
    cardsPerPack: 10,
    onHand: 0,
    incoming: 12,
    allocated: 0,
    safetyStock: 1,
    preorderReserve: 4,
    maxPerCustomer: 1,
    image: heroImage,
    description:
      "High-demand sealed collector configuration with one-box customer caps until allocation clears.",
    tags: ["Coming soon", "Limit 1", "Collector"],
    channels: ["b2c"],
  },
  {
    slug: "grand-line-case",
    name: "Grand Line Booster Case",
    game: "One Piece Card Game",
    publisher: "Bandai",
    setName: "Grand Line Clash",
    setCode: "GLC",
    releaseDate: "2026-07-24",
    setStatus: "released",
    productType: "Sealed case",
    sku: "OP-GLC-CASE-EN",
    language: "EN",
    priceCents: 109900,
    msrpCents: null,
    currency: "SGD",
    packsPerBox: 24,
    cardsPerPack: 12,
    onHand: 3,
    incoming: 0,
    allocated: 1,
    safetyStock: 0,
    preorderReserve: 0,
    maxPerCustomer: null,
    image: heroImage,
    description:
      "Factory-sealed case for approved wholesale accounts and high-volume local buyers.",
    tags: ["Wholesale", "In stock", "Case"],
    channels: ["b2b"],
  },
  {
    slug: "aurora-booster-box",
    name: "Aurora Skies Booster Box",
    game: "Lorcana",
    publisher: "Ravensburger",
    setName: "Aurora Skies",
    setCode: "AUR",
    releaseDate: "2026-10-02",
    setStatus: "preorder_open",
    productType: "Booster box",
    sku: "LOR-AUR-BB-EN",
    language: "EN",
    priceCents: 21400,
    msrpCents: 22800,
    currency: "SGD",
    packsPerBox: 24,
    cardsPerPack: 12,
    onHand: 0,
    incoming: 18,
    allocated: 6,
    safetyStock: 2,
    preorderReserve: 6,
    maxPerCustomer: 2,
    image: heroImage,
    description:
      "Family-friendly sealed booster display with transparent preorder allocation and balance reminders.",
    tags: ["Preorder", "Family", "Balance later"],
    channels: ["b2c"],
  },
];

export const cartLines: CartLine[] = [
  { productSlug: "smp-play-booster-box", quantity: 1, channel: "b2c" },
  { productSlug: "aurora-booster-box", quantity: 1, channel: "b2c" },
];

export const accessStates: AccessState[] = [
  {
    key: "unauthenticated",
    label: "Signed out",
    detail: "Google sign-in is required before checkout, orders, or preorder deposits.",
    action: "Continue with Google",
    tone: "neutral",
  },
  {
    key: "authenticated_unpaid",
    label: "Signed in",
    detail: "Catalog and account are available; paid flows wait for checkout completion.",
    action: "Start checkout",
    tone: "warning",
  },
  {
    key: "payment_pending",
    label: "Payment pending",
    detail: "Stripe confirmation is in progress and inventory is not allocated yet.",
    action: "Refresh payment",
    tone: "info",
  },
  {
    key: "provisioning",
    label: "Provisioning",
    detail: "Customer row, pricing tier, and notification preferences are being prepared.",
    action: "View account",
    tone: "info",
  },
  {
    key: "active",
    label: "Active",
    detail: "Dashboard, orders, preorder balances, and B2B application status are available.",
    action: "Open dashboard",
    tone: "success",
  },
  {
    key: "error",
    label: "Needs help",
    detail: "A billing, provisioning, or profile issue needs operator review.",
    action: "Contact support",
    tone: "danger",
  },
];

export const accountSnapshot = {
  customerName: "Avery Tan",
  email: "avery@example.test",
  segment: "collector",
  defaultCurrency: "SGD",
  b2bStatus: "Application pending",
  pricingTier: "Retail",
  monthlySpendCents: 41300,
  preorderExposureCents: 82600,
  savedPaymentState: "Stripe customer ready",
};

export const orders: OrderSummary[] = [
  {
    id: "ORD-1048",
    status: "shipped",
    placedAt: "2026-06-28",
    totalCents: 21400,
    currency: "SGD",
    channel: "b2c",
    itemCount: 1,
    carrier: "Ninja Van",
    trackingNumber: "NVSG1048",
    lines: [{ productSlug: "aurora-booster-box", quantity: 1, channel: "b2c" }],
    timeline: [
      { label: "Paid", date: "2026-06-28", state: "complete" },
      { label: "Packed", date: "2026-06-29", state: "complete" },
      { label: "Shipped", date: "2026-06-30", state: "current" },
      { label: "Delivered", date: "Expected 2026-07-04", state: "upcoming" },
    ],
  },
  {
    id: "ORD-1031",
    status: "delivered",
    placedAt: "2026-06-11",
    totalCents: 19900,
    currency: "SGD",
    channel: "b2c",
    itemCount: 1,
    carrier: "SingPost",
    trackingNumber: "SP1031",
    lines: [{ productSlug: "smp-play-booster-box", quantity: 1, channel: "b2c" }],
    timeline: [
      { label: "Paid", date: "2026-06-11", state: "complete" },
      { label: "Packed", date: "2026-06-12", state: "complete" },
      { label: "Shipped", date: "2026-06-12", state: "complete" },
      { label: "Delivered", date: "2026-06-13", state: "complete" },
    ],
  },
];

export const preorders: PreorderSummary[] = [
  {
    id: "PRE-2084",
    status: "balance_due",
    createdAt: "2026-06-17",
    productSlug: "smp-play-booster-box",
    quantity: 2,
    unitPriceCents: 19900,
    depositCents: 8000,
    balanceCents: 31800,
    currency: "SGD",
    allocatedQty: 2,
    position: 4,
    channel: "b2c",
    timeline: [
      { label: "Deposit", date: "2026-06-17", state: "complete" },
      { label: "Allocated", date: "2026-07-01", state: "complete" },
      { label: "Balance due", date: "Due 2026-07-08", state: "current" },
      { label: "Ship", date: "After 2026-08-01", state: "upcoming" },
    ],
  },
  {
    id: "PRE-2116",
    status: "deposited",
    createdAt: "2026-06-30",
    productSlug: "aurora-booster-box",
    quantity: 1,
    unitPriceCents: 21400,
    depositCents: 4000,
    balanceCents: 17400,
    currency: "SGD",
    allocatedQty: 0,
    position: 9,
    channel: "b2c",
    timeline: [
      { label: "Deposit", date: "2026-06-30", state: "complete" },
      { label: "Allocation", date: "Pending supplier confirmation", state: "current" },
      { label: "Balance due", date: "TBD", state: "upcoming" },
      { label: "Ship", date: "After 2026-10-02", state: "upcoming" },
    ],
  },
];

export const adminMetrics = [
  { label: "Open preorder value", value: "SGD 82.6k", detail: "Deposit-backed demand" },
  { label: "Incoming boxes", value: "54", detail: "Across 4 active releases" },
  { label: "Allocation risk", value: "12", detail: "Boxes over confirmed reserve" },
  { label: "B2B applications", value: "3", detail: "Awaiting review" },
];

export const adminWorkQueue = [
  {
    title: "Capture balances",
    detail: "7 allocated preorders have balances due within 48 hours.",
    status: "Needs action",
  },
  {
    title: "Review B2B accounts",
    detail: "Three wholesale applications need UEN and payment-term checks.",
    status: "Review",
  },
  {
    title: "Receive purchase order",
    detail: "PO-774 has 24 incoming SMP boxes ready for warehouse intake.",
    status: "Today",
  },
  {
    title: "Run allocation",
    detail: "Aurora Skies supplier confirmation is expected after receiving.",
    status: "Blocked",
  },
];

export const purchaseOrders = [
  {
    id: "PO-774",
    supplier: "SEA Distributor",
    status: "confirmed",
    expectedAt: "2026-07-05",
    boxes: 24,
    valueCents: 132000,
    currency: "SGD",
  },
  {
    id: "PO-781",
    supplier: "Publisher direct",
    status: "submitted",
    expectedAt: "2026-08-21",
    boxes: 18,
    valueCents: 167400,
    currency: "SGD",
  },
];

export function formatMoney(cents: number, currency = "SGD"): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getProduct(slug: string): MarketplaceProduct | undefined {
  return marketplaceProducts.find((product) => product.slug === slug);
}

export function getOrder(id: string): OrderSummary | undefined {
  return orders.find((order) => order.id === id);
}

export function getCartTotal(lines: CartLine[]): number {
  return lines.reduce((total, line) => {
    const product = getProduct(line.productSlug);
    return total + (product?.priceCents ?? 0) * line.quantity;
  }, 0);
}

export function getAvailable(product: MarketplaceProduct): number {
  return Math.max(product.onHand + product.incoming - product.allocated - product.safetyStock, 0);
}

export function getPreorderExposure(): number {
  return preorders.reduce((total, preorder) => total + preorder.balanceCents, 0);
}
