import PurchaseOrderPage from "@/app/(shop)/control/supply/purchase-orders/[purchaseOrderId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function PurchaseOrderModal(props: Parameters<typeof PurchaseOrderPage>[0]) {
  return (
    <ControlModalRoute>
      <PurchaseOrderPage {...props} />
    </ControlModalRoute>
  );
}
