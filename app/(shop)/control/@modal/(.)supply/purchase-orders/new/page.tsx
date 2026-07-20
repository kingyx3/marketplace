import NewPurchaseOrderPage from "@/app/(shop)/control/supply/purchase-orders/new/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function NewPurchaseOrderModal() {
  return (
    <ControlModalRoute>
      <NewPurchaseOrderPage />
    </ControlModalRoute>
  );
}
