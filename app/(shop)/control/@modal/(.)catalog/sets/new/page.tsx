import NewSetPage from "@/app/(shop)/control/catalog/sets/new/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function NewSetModal(props: Parameters<typeof NewSetPage>[0]) {
  return (
    <ControlModalRoute>
      <NewSetPage {...props} />
    </ControlModalRoute>
  );
}
