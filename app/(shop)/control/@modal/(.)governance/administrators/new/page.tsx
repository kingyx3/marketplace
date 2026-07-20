import NewAdministratorPage from "@/app/(shop)/control/governance/administrators/new/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function NewAdministratorModal() {
  return (
    <ControlModalRoute>
      <NewAdministratorPage />
    </ControlModalRoute>
  );
}
