import NewProductPage from "@/app/(shop)/control/catalog/products/new/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function NewProductModal() {
  return (
    <ControlModalRoute>
      <NewProductPage />
    </ControlModalRoute>
  );
}
