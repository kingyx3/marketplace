import SetPage from "@/app/(shop)/control/catalog/sets/[setId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function SetModal(props: Parameters<typeof SetPage>[0]) {
  return (
    <ControlModalRoute>
      <SetPage {...props} />
    </ControlModalRoute>
  );
}
