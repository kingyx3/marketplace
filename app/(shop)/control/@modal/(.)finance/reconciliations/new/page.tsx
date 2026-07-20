import ReconciliationPage from "@/app/(shop)/control/finance/reconciliations/new/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function ReconciliationModal(props: Parameters<typeof ReconciliationPage>[0]) {
  return (
    <ControlModalRoute>
      <ReconciliationPage {...props} />
    </ControlModalRoute>
  );
}
