import type { Metadata } from "next";

import { PolicyPage, PolicySection } from "@/app/_components/policy-page";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "Accessibility commitments and how to report a barrier.",
};

export default function AccessibilityPage() {
  return (
    <PolicyPage
      title="Accessibility Statement"
      summary="We aim to make catalog, account, and checkout workflows usable with assistive technology and different input methods."
    >
      <PolicySection title="Our approach">
        <p>
          We use semantic headings and landmarks, labelled controls, keyboard-operable actions,
          visible focus, responsive layouts, status announcements, meaningful link text, and text
          alternatives for informative imagery. We review important storefront changes for these
          behaviors and address regressions as part of normal maintenance.
        </p>
      </PolicySection>

      <PolicySection title="Known limitations and feedback">
        <p>
          Third-party payment or authentication interfaces may have their own accessibility
          behavior. If a barrier prevents you from browsing, ordering, or managing an account,
          contact support with the page, device, browser, and assistive technology involved. We will
          provide a reasonable alternative where possible and use the report to improve the service.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
