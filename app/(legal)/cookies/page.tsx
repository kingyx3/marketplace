import type { Metadata } from "next";

import { PolicyPage, PolicySection } from "@/app/_components/policy-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Essential cookies, optional monitoring, and preference controls.",
};

export default function CookiesPage() {
  return (
    <PolicyPage
      title="Cookie Policy"
      summary="This policy explains the cookies and similar browser storage used by the marketplace."
    >
      <PolicySection title="Essential storage">
        <p>
          Supabase Auth uses cookies to maintain and refresh a secure sign-in session. The
          marketplace cart cookie stores only product identifiers and quantities for up to 30 days. A
          preference cookie remembers whether you selected essential-only or optional analytics.
          These are needed to provide the choices and features you request.
        </p>
      </PolicySection>

      <PolicySection title="Optional monitoring">
        <p>
          With your permission, browser performance traces and privacy-masked Sentry error replay
          help us diagnose failures. Text is masked, media is blocked, and known credentials and
          personal fields are scrubbed before reporting. Optional browser tracing and replay remain
          disabled until you choose Allow analytics.
        </p>
      </PolicySection>

      <PolicySection title="Change or withdraw your choice">
        <p>
          Open Cookie preferences in the footer at any time. Choosing Essential only disables new
          optional monitoring on subsequent navigation. You can also remove site data in your
          browser, but doing so may sign you out, clear your cart, and ask for your preference
          again.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
