import { AdministratorGrantForm } from "@/app/(shop)/control/_components/administrator-grant-form";
import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";

export const dynamic = "force-dynamic";

export default async function NewAdministratorPage() {
  await requireControlPermission("governance.manage", "/control/governance/administrators/new");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <ControlBackLink href="/control/governance/administrators">
            Back to administrators
          </ControlBackLink>
        }
        description="Choose a template, then provision exact domain and action coverage with least privilege. Access activates after the exact email signs in."
        eyebrow="Control · Administrators"
        title="Provision administrator"
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <AdministratorGrantForm />
      </section>
    </div>
  );
}
