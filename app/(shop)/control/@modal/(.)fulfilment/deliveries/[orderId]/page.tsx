import DeliveryPage from "@/app/(shop)/control/fulfilment/deliveries/[orderId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function DeliveryModal(props: Parameters<typeof DeliveryPage>[0]) {
  return (
    <ControlModalRoute>
      <DeliveryPage {...props} />
    </ControlModalRoute>
  );
}
