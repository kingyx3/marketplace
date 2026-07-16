import AdminOperationsPage from "@/app/(shop)/admin/page";
import { requireControlPermission } from "@/lib/control-access";

export const dynamic = "force-dynamic";

export default async function ControlOperationsPage() {
  await requireControlPermission("manage_full_operations", "/control/operations");
  return <AdminOperationsPage />;
}
