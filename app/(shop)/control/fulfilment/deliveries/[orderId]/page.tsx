import { notFound } from "next/navigation";

import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import { DeliveryEditor } from "@/app/(shop)/control/_components/delivery-editor";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { getAdminDeliveryOrder } from "@/lib/deliveries";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { staff } = await requireControlPermission(
    "fulfilment.view",
    `/control/fulfilment/deliveries/${orderId}`
  );
  const order = await getAdminDeliveryOrder(createSecretClient(), orderId);
  if (!order) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">Fully paid</StatusBadge>
            <ControlBackLink href="/control/fulfilment/deliveries">
              Back to deliveries
            </ControlBackLink>
          </>
        }
        description={order.customer?.email ?? order.id}
        eyebrow="Control · Delivery"
        title={order.customer?.name || "Delivery order"}
      />
      <DeliveryEditor canManage={hasControlPermission(staff, "fulfilment.manage")} order={order} />
    </div>
  );
}
