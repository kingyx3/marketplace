import type { Metadata } from "next";
import Link from "next/link";

import { PolicyPage, PolicySection } from "@/app/_components/policy-page";
import { getPolicyOperatorName, getSupportEmail } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How personal data is collected, used, disclosed, protected, and retained.",
};

export default function PrivacyPage() {
  const operator = getPolicyOperatorName();
  const supportEmail = getSupportEmail();

  return (
    <PolicyPage
      title="Privacy Policy"
      summary={`${operator} explains here how personal data is handled when you browse, sign in, buy, request wholesale access, or contact support.`}
    >
      <PolicySection title="Data we collect">
        <p>
          We collect account identifiers and profile details supplied through Google and Supabase
          Auth; contact, billing, delivery, order, payment-status, preorder, wholesale-application,
          waitlist, and support information; and security, device, request, and reliability data.
          Stripe processes payment-card details directly, and we do not store complete card numbers.
        </p>
      </PolicySection>

      <PolicySection title="Why we use personal data">
        <p>
          We use data to authenticate accounts, fulfil orders and preorders, calculate eligibility
          and pricing, prevent fraud, deliver notifications, provide support, meet accounting and
          legal duties, secure the service, and diagnose reliability problems. Marketing messages
          are sent only where the required choice or permission has been recorded.
        </p>
      </PolicySection>

      <PolicySection title="Service providers and transfers">
        <p>
          We disclose only the data reasonably needed to providers that support the service,
          including Supabase for authentication and database services, Vercel for hosting, Google
          for sign-in, Stripe for payments, Sentry for privacy-scrubbed error monitoring, and
          configured communications providers such as Resend or Twilio. These providers may process
          data outside Singapore under their own infrastructure and contractual safeguards.
        </p>
        <p>
          We may also disclose information where law requires it or to protect users and the
          service.
        </p>
      </PolicySection>

      <PolicySection title="Retention and security">
        <p>
          We retain records only for as long as reasonably needed for the purposes above, including
          fulfilment, dispute, fraud-prevention, tax, accounting, and legal requirements. Retention
          varies by record type. We use access controls, row-level database policies, encryption in
          transit, restricted service credentials, audit records, and privacy scrubbing, but no
          internet service can guarantee absolute security.
        </p>
      </PolicySection>

      <PolicySection title="Your choices and requests">
        <p>
          You may ask about access, correction, withdrawal of consent, or another privacy concern.
          Withdrawing consent does not affect processing already lawfully completed and may prevent
          us from providing features that need the affected data. You can also change optional
          monitoring choices through Cookie preferences in the footer.
        </p>
        <p>
          {supportEmail ? (
            <>
              Contact our support and data-protection point at{" "}
              <a
                className="font-semibold text-emerald-700 hover:text-emerald-900"
                href={`mailto:${supportEmail}`}
              >
                {supportEmail}
              </a>
              .
            </>
          ) : (
            <>
              Use the channel described on our{" "}
              <Link
                className="font-semibold text-emerald-700 hover:text-emerald-900"
                href="/contact"
              >
                Contact page
              </Link>
              .
            </>
          )}
        </p>
      </PolicySection>

      <PolicySection title="Changes">
        <p>
          We may update this policy when the service or legal requirements change. The effective
          date above identifies the current version; material changes will be communicated through
          an appropriate account or storefront notice.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
