import { useGetMe } from "@workspace/api-client-react";

export type AppRole = "admin" | "manager" | "accountant" | "warehouse";

const ROLE_LEVEL: Record<string, number> = {
  admin: 4,
  manager: 3,
  accountant: 2,
  warehouse: 1,
};

export function useCurrentUser() {
  const { data: user, isLoading } = useGetMe();

  function canDo(minRole: AppRole): boolean {
    if (!user?.role) return false;
    return (ROLE_LEVEL[user.role as string] ?? 0) >= (ROLE_LEVEL[minRole] ?? 99);
  }

  return { user, role: user?.role as AppRole | undefined, canDo, isLoading };
}
