import ProductPricePage from "@/app/(shop)/control/pricing/products/[productId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function ProductPriceModal(props: Parameters<typeof ProductPricePage>[0]) {
  return (
    <ControlModalRoute>
      <ProductPricePage {...props} />
    </ControlModalRoute>
  );
}
