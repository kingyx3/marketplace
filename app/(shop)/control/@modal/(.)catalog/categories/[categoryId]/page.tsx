import CategoryPage from "@/app/(shop)/control/catalog/categories/[categoryId]/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function CategoryModal(props: Parameters<typeof CategoryPage>[0]) {
  return (
    <ControlModalRoute>
      <CategoryPage {...props} />
    </ControlModalRoute>
  );
}
