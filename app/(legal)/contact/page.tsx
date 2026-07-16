import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage, PolicySection } from "@/app/_components/policy-page";
import { getSupportEmail } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to contact marketplace support and raise order or privacy concerns.",
};

export default function ContactPage() {
  const supportEmail = getSupportEmail();

  return (
    <PolicyPage
      title="Contact"
      summary="Contact support about orders, preorders, wholesale access, privacy, accessibility, or another marketplace issue."
    >
      <PolicySection title="Support channel">
        {supportEmail ? (
          <p>
            Email{" "}
            <a
              className="font-semibold text-emerald-700 hover:text-emerald-900"
              href={`mailto:${supportEmail}`}
            >
              {supportEmail}
            </a>
            . Include the order reference where relevant, but never send passwords, authentication
            tokens, or complete payment-card details.
          </p>
        ) : (
          <p>
            For an existing transaction, reply through the support contact included in your order
            communication and include the order reference. Signed-in customers can also review the
            relevant status in their{" "}
            <Link className="font-semibold text-emerald-700 hover:text-emerald-900" href="/account">
              account
            </Link>
            .
          </p>
        )}
      </PolicySection>

      <PolicySection title="What to include">
        <p>
          Describe the issue, the page or product involved, the outcome you need, and any relevant
          order reference. For delivery damage, keep the packaging and attach clear photos. For a
          privacy request, identify the account email and the type of request without sending more
          personal data than necessary.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
