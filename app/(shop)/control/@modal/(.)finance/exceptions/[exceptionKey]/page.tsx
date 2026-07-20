import ExceptionPage from "@/app/(shop)/control/finance/exceptions/[exceptionKey]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function ExceptionModal(props: Parameters<typeof ExceptionPage>[0]) {
  return (
    <ControlModalRoute>
      <ExceptionPage {...props} />
    </ControlModalRoute>
  );
}
