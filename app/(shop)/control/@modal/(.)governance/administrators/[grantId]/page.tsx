import AdministratorPage from "@/app/(shop)/control/governance/administrators/[grantId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function AdministratorModal(props: Parameters<typeof AdministratorPage>[0]) {
  return (
    <ControlModalRoute>
      <AdministratorPage {...props} />
    </ControlModalRoute>
  );
}
