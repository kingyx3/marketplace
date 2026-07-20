import ListingPage from "@/app/(shop)/control/storefront/listings/[productId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function ListingModal(props: Parameters<typeof ListingPage>[0]) {
  return (
    <ControlModalRoute>
      <ListingPage {...props} />
    </ControlModalRoute>
  );
}
