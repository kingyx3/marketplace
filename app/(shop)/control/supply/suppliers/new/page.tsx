import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import { SupplierForm } from "@/app/(shop)/control/_components/supplier-form";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  await requireControlPermission("suppliers.manage", "/control/supply/suppliers/new");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <ControlBackLink href="/control/supply/suppliers">Back to suppliers</ControlBackLink>
        }
        description="Create a supplier record before using it in purchase-order workflows."
        eyebrow="Control · Suppliers"
        title="Add supplier"
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <SupplierForm />
      </section>
    </div>
  );
}
