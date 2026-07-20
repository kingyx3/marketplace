import SupplierPage from "@/app/(shop)/control/supply/suppliers/[supplierId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function SupplierModal(props: Parameters<typeof SupplierPage>[0]) {
  return (
    <ControlModalRoute>
      <SupplierPage {...props} />
    </ControlModalRoute>
  );
}
