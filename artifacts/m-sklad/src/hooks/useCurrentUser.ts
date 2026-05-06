import { useGetMe } from "@workspace/api-client-react";
import { ROLE_LABELS } from "@/lib/roles";

export { ROLE_LABELS };

export type AppRole = "admin" | "manager" | "accountant" | "warehouse";

const ROLE_LEVEL: Record<string, number> = {
  admin: 4,
  manager: 3,
  accountant: 2,
  warehouse: 1,
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

  function canDo(minRole: AppRole): boolean {
    if (!user?.role) return false;
    return (ROLE_LEVEL[user.role as string] ?? 0) >= (ROLE_LEVEL[minRole] ?? 99);
  }

  const roleLabel = user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "";

  return { user, role: user?.role as AppRole | undefined, canDo, isLoading, isError, roleLabel };
}
