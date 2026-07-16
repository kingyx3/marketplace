import type { Metadata } from "next";

import { PolicyPage, PolicySection } from "@/app/_components/policy-page";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "Delivery coverage, charges, tracking, and address responsibilities.",
};

export default function ShippingPage() {
  return (
    <PolicyPage
      title="Shipping Policy"
      summary="The current checkout supports validated delivery addresses in Singapore."
    >
      <PolicySection title="Coverage and charges">
        <p>
          Checkout currently accepts Singapore delivery addresses. Available service, shipping
          charge, free-shipping threshold, and currency are calculated from the active server-side
          policy and shown before payment. We do not silently add mandatory delivery charges after
          checkout confirmation.
        </p>
      </PolicySection>

      <PolicySection title="Dispatch and estimates">
        <p>
          In-stock orders are prepared after payment confirmation. Preorders dispatch after release,
          allocation, and balance payment. Dates and carrier estimates are not guarantees, but we
          will provide material delay information when available.
        </p>
      </PolicySection>

      <PolicySection title="Address and delivery issues">
        <p>
          Check the recipient, phone, postal code, and address before payment. Contact support as
          soon as possible if a correction is needed; a change may not be possible after handoff to
          the carrier. Additional costs caused by an incorrect address or repeated failed delivery
          may be charged where permitted and disclosed.
        </p>
      </PolicySection>

      <PolicySection title="Tracking, loss, and damage">
        <p>
          Tracking is shown in the account when supplied by the carrier. Report a missing or damaged
          parcel promptly and retain packaging for investigation. Remedies depend on carrier
          findings, the order facts, and rights that apply under law.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
