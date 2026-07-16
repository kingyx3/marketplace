import type { Metadata } from "next";

import { PolicyPage, PolicySection } from "@/app/_components/policy-page";

export const metadata: Metadata = {
  title: "Returns and Refunds Policy",
  description: "Return, cancellation, damaged-item, and preorder refund handling.",
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      title="Returns and Refunds Policy"
      summary="How to request help with damaged, incorrect, cancelled, or unwanted sealed products."
    >
      <PolicySection title="Damaged, incorrect, or non-conforming goods">
        <p>
          Contact support promptly after delivery with the order reference, photos of the shipping
          package and product, and a description of the issue. Keep the packaging while the claim is
          reviewed. Where goods are defective, materially not as described, or supplied incorrectly,
          we will provide the remedy required by applicable law and the circumstances.
        </p>
      </PolicySection>

      <PolicySection title="Change-of-mind returns">
        <p>
          Do not send a product back without return authorisation. Factory-sealed trading card
          products may be considered only while the original wrap, seals, contents, and packaging
          remain intact and resalable. Opened, tampered, personalised, clearance-final, or
          release-sensitive products are generally not eligible unless they are defective or the law
          requires otherwise. Approved return shipping may be deducted where the return is not due
          to our error.
        </p>
      </PolicySection>

      <PolicySection title="Orders and preorders">
        <p>
          Pending payments can be cancelled through the available checkout flow. After payment or
          allocation, contact support because inventory and supplier commitments may already exist.
          If a preorder cannot be allocated, paid amounts for the unallocated quantity will be
          refunded. Partial allocation, balance deadlines, and customer-requested cancellations are
          reviewed against the displayed preorder terms and applicable law.
        </p>
      </PolicySection>

      <PolicySection title="Refund processing">
        <p>
          Approved refunds are returned to the original payment method where practical. Provider and
          bank processing times vary. Delivery charges are refunded when required by law or when the
          return results from our fulfilment error; otherwise they may remain non-refundable.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
