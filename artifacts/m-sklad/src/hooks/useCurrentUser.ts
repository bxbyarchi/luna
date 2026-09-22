import { useGetMe } from "@workspace/api-client-react";
import { ROLE_LABELS } from "@/lib/roles";

export { ROLE_LABELS };

export type AppRole =
  | "super_admin"
  | "warehouse_chief"
  | "manager"
  | "accountant"
  | "warehouse"
  | "location_admin"
  | "cashier";

// Two independent tracks: warehouse (склад) and venue/kassa (ярмарка).
// super_admin sits atop both; warehouse_chief and location_admin/cashier
// never overlap — mirrors artifacts/api-server/src/middleware/rbac.ts.
const WAREHOUSE_LEVEL: Partial<Record<AppRole, number>> = {
  super_admin: 4,
  warehouse_chief: 4,
  manager: 3,
  accountant: 2,
  warehouse: 1,
};
const VENUE_LEVEL: Partial<Record<AppRole, number>> = {
  super_admin: 3,
  location_admin: 2,
  cashier: 1,
};

export function useCurrentUser() {
  const { data: user, isLoading, isError } = useGetMe({
    query: {
      queryKey: ["/api/auth/me"],
      staleTime: 0,
      refetchOnMount: "always" as const,
      refetchOnWindowFocus: true,
    },
  });

  const role = user?.role as AppRole | undefined;

  /** Warehouse-domain rank check (super_admin, warehouse_chief, manager, accountant, warehouse). */
  function canDo(minRole: AppRole): boolean {
    if (!role) return false;
    return (WAREHOUSE_LEVEL[role] ?? 0) >= (WAREHOUSE_LEVEL[minRole] ?? 99);
  }

  /** Venue/kassa-domain rank check (super_admin, location_admin, cashier). */
  function canDoVenue(minRole: AppRole): boolean {
    if (!role) return false;
    return (VENUE_LEVEL[role] ?? 0) >= (VENUE_LEVEL[minRole] ?? 99);
  }

  const isSuperAdmin = role === "super_admin";
  const isWarehouseAdmin = role === "super_admin" || role === "warehouse_chief";
  const isVenueAdmin = role === "super_admin";
  const canManageUsers = role === "super_admin" || role === "location_admin";

  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : "";

  return {
    user,
    role,
    canDo,
    canDoVenue,
    isSuperAdmin,
    isWarehouseAdmin,
    isVenueAdmin,
    canManageUsers,
    isLoading,
    isError,
    roleLabel,
  };
}
