import OrderPage from "@/app/(shop)/control/orders/normal/[orderId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function OrderModal(props: Parameters<typeof OrderPage>[0]) {
  return (
    <ControlModalRoute>
      <OrderPage {...props} />
    </ControlModalRoute>
  );
}
