import DealPage from "@/app/(shop)/control/pricing/deals/[dealId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function DealModal(props: Parameters<typeof DealPage>[0]) {
  return (
    <ControlModalRoute>
      <DealPage {...props} />
    </ControlModalRoute>
  );
}
