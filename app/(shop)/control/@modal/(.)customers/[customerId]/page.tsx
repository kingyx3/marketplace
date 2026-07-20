import CustomerPage from "@/app/(shop)/control/customers/[customerId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function CustomerModal(props: Parameters<typeof CustomerPage>[0]) {
  return (
    <ControlModalRoute>
      <CustomerPage {...props} />
    </ControlModalRoute>
  );
}
