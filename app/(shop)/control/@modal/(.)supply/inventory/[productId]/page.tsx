import InventoryPage from "@/app/(shop)/control/supply/inventory/[productId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function InventoryModal(props: Parameters<typeof InventoryPage>[0]) {
  return (
    <ControlModalRoute>
      <InventoryPage {...props} />
    </ControlModalRoute>
  );
}
