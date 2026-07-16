import type { Metadata } from "next";

import { PolicyPage, PolicySection } from "@/app/_components/policy-page";
import { getPolicyOperatorName } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing use of the marketplace and purchases.",
};

export default function TermsPage() {
  const operator = getPolicyOperatorName();

  return (
    <PolicyPage
      title="Terms of Service"
      summary={`These terms govern use of ${operator}, including catalog browsing, accounts, orders, preorders, and wholesale applications.`}
    >
      <PolicySection title="Accounts and acceptable use">
        <p>
          You must provide accurate information, keep account access secure, and be legally capable
          of entering the transaction or act with a parent or guardian. Do not misuse the service,
          interfere with security, automate abusive purchases, evade customer limits, impersonate
          another person, or access administrative functions without permission.
        </p>
      </PolicySection>

      <PolicySection title="Catalog, prices, and availability">
        <p>
          Regular product prices are public. Eligible limited-time or wholesale pricing is shown
          only to the audience entitled to it and is revalidated on the server at checkout. Prices
          are displayed in the stated currency and include GST where applicable; delivery charges
          are shown before payment. Obvious display errors may be corrected before an order is
          accepted.
        </p>
        <p>
          Stock and incoming allocations can change. Adding an item to a cart does not reserve it.
          An order is accepted only after the required payment or approved invoice process succeeds
          and inventory is allocated.
        </p>
      </PolicySection>

      <PolicySection title="Preorders and allocation">
        <p>
          Preorders may use a deposit, supplier-confirmed allocation, a later balance payment, and
          per-customer limits. Dates are estimates unless expressly stated otherwise. If upstream
          supply is reduced, allocation rules shown for the product apply and any unallocated paid
          amount will be handled under the Returns and Refunds Policy and applicable law.
        </p>
      </PolicySection>

      <PolicySection title="Payments, delivery, and returns">
        <p>
          Payments are processed through the method presented at checkout. Approved business
          accounts may receive separate invoice terms. Delivery risk, unsuccessful delivery,
          cancellation, return, and refund handling are described in the Shipping Policy and Returns
          and Refunds Policy, which form part of these terms.
        </p>
      </PolicySection>

      <PolicySection title="Intellectual property and service availability">
        <p>
          Storefront content and software may not be copied or exploited except as law permits.
          Product names and artwork may belong to their respective owners. We may maintain, secure,
          suspend, or change the service, but will not use these rights to avoid obligations for
          accepted orders.
        </p>
      </PolicySection>

      <PolicySection title="Liability and governing law">
        <p>
          Nothing in these terms excludes rights or liabilities that cannot lawfully be excluded. To
          the extent permitted by law, indirect or consequential loss is excluded. These terms are
          governed by Singapore law, and disputes should first be raised with support so the parties
          can try to resolve them promptly.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
