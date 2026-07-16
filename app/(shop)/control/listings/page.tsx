import AdminListingsPage from "@/app/(shop)/admin/listings/page";
import { requireControlPermission } from "@/lib/control-access";

export const dynamic = "force-dynamic";

export default async function ControlListingsPage() {
  await requireControlPermission("manage_catalog", "/control/listings");
  return <AdminListingsPage />;
}
