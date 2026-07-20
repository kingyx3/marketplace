import NewDealPage from "@/app/(shop)/control/pricing/deals/new/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function NewDealModal(props: Parameters<typeof NewDealPage>[0]) {
  return (
    <ControlModalRoute>
      <NewDealPage {...props} />
    </ControlModalRoute>
  );
}
