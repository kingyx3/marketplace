import NewCategoryPage from "@/app/(shop)/control/catalog/categories/new/page";
import { ControlModalRoute } from "@/app/(shop)/control/_components/control-modal-route";

export default function NewCategoryModal(props: Parameters<typeof NewCategoryPage>[0]) {
  return (
    <ControlModalRoute>
      <NewCategoryPage {...props} />
    </ControlModalRoute>
  );
}
