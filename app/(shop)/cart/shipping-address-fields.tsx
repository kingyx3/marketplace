"use client";

export interface ShippingAddressInput {
  recipientName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  phone: string;
}

export const emptyShippingAddress: ShippingAddressInput = {
  recipientName: "",
  line1: "",
  line2: "",
  city: "Singapore",
  region: "",
  postalCode: "",
  countryCode: "SG",
  phone: "",
};

export function isShippingAddressComplete(address: ShippingAddressInput): boolean {
  return Boolean(
    address.recipientName.trim() &&
    address.line1.trim() &&
    address.postalCode.trim() &&
    /^[A-Za-z]{2}$/.test(address.countryCode.trim())
  );
}

export function shippingAddressPayload(address: ShippingAddressInput) {
  return {
    recipientName: address.recipientName.trim(),
    line1: address.line1.trim(),
    line2: address.line2.trim() || undefined,
    city: address.city.trim() || undefined,
    region: address.region.trim() || undefined,
    postalCode: address.postalCode.trim(),
    countryCode: address.countryCode.trim().toUpperCase(),
    phone: address.phone.trim() || undefined,
  };
}

export function ShippingAddressFields({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: ShippingAddressInput) => void;
  value: ShippingAddressInput;
}) {
  function set<K extends keyof ShippingAddressInput>(key: K, nextValue: ShippingAddressInput[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <fieldset
      className="grid min-w-0 gap-3 rounded-md border border-zinc-200 bg-white p-3 sm:p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold text-zinc-950">Delivery address</legend>
      <p className="text-xs leading-5 text-zinc-600">
        The server validates the destination and calculates shipping before creating payment.
      </p>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
        Recipient name
        <input
          autoComplete="shipping name"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          maxLength={120}
          onChange={(event) => set("recipientName", event.target.value)}
          required
          value={value.recipientName}
        />
      </label>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
        Address line 1
        <input
          autoComplete="shipping address-line1"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          maxLength={160}
          onChange={(event) => set("line1", event.target.value)}
          required
          value={value.line1}
        />
      </label>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
        Address line 2
        <input
          autoComplete="shipping address-line2"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          maxLength={160}
          onChange={(event) => set("line2", event.target.value)}
          value={value.line2}
        />
      </label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
          City
          <input
            autoComplete="shipping address-level2"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
            maxLength={120}
            onChange={(event) => set("city", event.target.value)}
            value={value.city}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
          State or region
          <input
            autoComplete="shipping address-level1"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
            maxLength={120}
            onChange={(event) => set("region", event.target.value)}
            value={value.region}
          />
        </label>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
          Postal code
          <input
            autoComplete="shipping postal-code"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
            maxLength={20}
            onChange={(event) => set("postalCode", event.target.value)}
            required
            value={value.postalCode}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
          Country code
          <input
            autoCapitalize="characters"
            autoComplete="shipping country"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm uppercase"
            maxLength={2}
            minLength={2}
            onChange={(event) => set("countryCode", event.target.value.toUpperCase())}
            pattern="[A-Za-z]{2}"
            required
            value={value.countryCode}
          />
        </label>
      </div>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700">
        Phone
        <input
          autoComplete="shipping tel"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          maxLength={40}
          onChange={(event) => set("phone", event.target.value)}
          type="tel"
          value={value.phone}
        />
      </label>
    </fieldset>
  );
}
