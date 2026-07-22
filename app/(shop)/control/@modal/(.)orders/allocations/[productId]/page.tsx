import AllocationPage from "@/app/(shop)/control/orders/allocations/[productId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function AllocationModal(props: Parameters<typeof AllocationPage>[0]) {
  return (
    <ControlModalRoute>
      <AllocationPage {...props} />
    </ControlModalRoute>
  );
}
