import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import {
  hasControlPermission,
  type ControlPermission,
} from "@/lib/control-permissions";

export { hasControlPermission, type ControlPermission } from "@/lib/control-permissions";

export async function requireControlPermission(
  permission: ControlPermission,
  next = "/control"
) {
  const context = await requireStaff(next);
  if (!hasControlPermission(context.staff, permission)) {
    redirect("/access-denied");
  }
  return context;
}
