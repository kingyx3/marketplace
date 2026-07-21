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
      <div className="flex flex-wrap items-start justify-between gap-2 text-xs leading-5 text-zinc-600">
        <p>The destination is validated and shipping is calculated before payment.</p>
        <p>
          <span aria-hidden="true" className="font-semibold text-rose-600">
            *
          </span>{" "}
          Required
        </p>
      </div>
      <label className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700" htmlFor="shipping-name">
        <span>
          Recipient name <RequiredMark />
        </span>
        <input
          aria-required="true"
          autoCapitalize="words"
          autoComplete="shipping name"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          enterKeyHint="next"
          id="shipping-name"
          maxLength={120}
          name="name"
          onChange={(event) => set("recipientName", event.target.value)}
          required
          value={value.recipientName}
        />
      </label>
      <label
        className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700"
        htmlFor="shipping-address-line1"
      >
        <span>
          Address line 1 <RequiredMark />
        </span>
        <input
          aria-required="true"
          autoCapitalize="words"
          autoComplete="shipping address-line1"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          enterKeyHint="next"
          id="shipping-address-line1"
          maxLength={160}
          name="address-line1"
          onChange={(event) => set("line1", event.target.value)}
          required
          value={value.line1}
        />
      </label>
      <label
        className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700"
        htmlFor="shipping-address-line2"
      >
        Address line 2
        <input
          autoCapitalize="words"
          autoComplete="shipping address-line2"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          enterKeyHint="next"
          id="shipping-address-line2"
          maxLength={160}
          name="address-line2"
          onChange={(event) => set("line2", event.target.value)}
          value={value.line2}
        />
      </label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label
          className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700"
          htmlFor="shipping-city"
        >
          City
          <input
            autoCapitalize="words"
            autoComplete="shipping address-level2"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
            enterKeyHint="next"
            id="shipping-city"
            maxLength={120}
            name="address-level2"
            onChange={(event) => set("city", event.target.value)}
            value={value.city}
          />
        </label>
        <label
          className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700"
          htmlFor="shipping-region"
        >
          State or region
          <input
            autoCapitalize="words"
            autoComplete="shipping address-level1"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
            enterKeyHint="next"
            id="shipping-region"
            maxLength={120}
            name="address-level1"
            onChange={(event) => set("region", event.target.value)}
            value={value.region}
          />
        </label>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label
          className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700"
          htmlFor="shipping-postal-code"
        >
          <span>
            Postal code <RequiredMark />
          </span>
          <input
            aria-required="true"
            autoComplete="shipping postal-code"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
            enterKeyHint="next"
            id="shipping-postal-code"
            inputMode="numeric"
            maxLength={20}
            name="postal-code"
            onChange={(event) => set("postalCode", event.target.value)}
            required
            spellCheck={false}
            value={value.postalCode}
          />
        </label>
        <label
          className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700"
          htmlFor="shipping-country"
        >
          <span>
            Country <RequiredMark />
          </span>
          <select
            aria-required="true"
            autoComplete="shipping country"
            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            id="shipping-country"
            name="country"
            onChange={(event) => set("countryCode", event.target.value)}
            required
            value={value.countryCode}
          >
            <option value="SG">Singapore</option>
          </select>
        </label>
      </div>
      <label
        className="grid min-w-0 gap-1 text-xs font-medium text-zinc-700"
        htmlFor="shipping-phone"
      >
        Phone
        <input
          autoComplete="shipping tel"
          className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm"
          enterKeyHint="done"
          id="shipping-phone"
          inputMode="tel"
          maxLength={40}
          name="tel"
          onChange={(event) => set("phone", event.target.value)}
          spellCheck={false}
          type="tel"
          value={value.phone}
        />
      </label>
    </fieldset>
  );
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="font-semibold text-rose-600">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
