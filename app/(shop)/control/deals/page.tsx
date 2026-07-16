import AdminDealsPage from "@/app/(shop)/admin/deals/page";
import { requireControlPermission } from "@/lib/control-access";

export const dynamic = "force-dynamic";

export default async function ControlDealsPage() {
  await requireControlPermission("manage_catalog", "/control/deals");
  return <AdminDealsPage />;
}
