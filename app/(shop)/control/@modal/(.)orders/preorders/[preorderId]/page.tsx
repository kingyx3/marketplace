import PreorderPage from "@/app/(shop)/control/orders/preorders/[preorderId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function PreorderModal(props: Parameters<typeof PreorderPage>[0]) {
  return (
    <ControlModalRoute>
      <PreorderPage {...props} />
    </ControlModalRoute>
  );
}
