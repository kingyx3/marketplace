import SkuPricePage from "@/app/(shop)/control/pricing/skus/[skuId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function SkuPriceModal(props: Parameters<typeof SkuPricePage>[0]) {
  return (
    <ControlModalRoute>
      <SkuPricePage {...props} />
    </ControlModalRoute>
  );
}
