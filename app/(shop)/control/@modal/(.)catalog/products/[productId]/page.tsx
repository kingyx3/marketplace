import ProductPage from "@/app/(shop)/control/catalog/products/[productId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function ProductModal(props: Parameters<typeof ProductPage>[0]) {
  return (
    <ControlModalRoute>
      <ProductPage {...props} />
    </ControlModalRoute>
  );
}
