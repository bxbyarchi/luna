export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Супер-админ",
  warehouse_chief: "Завхоз",
  manager: "Управляющий",
  accountant: "Бухгалтер",
  warehouse: "Кладовщик",
  location_admin: "Админ площадки",
  cashier: "Кассир",
  pending: "Ждёт роль",
};

// "pending" marks a new account nobody has granted a role to yet — it's a
// label, not something an administrator can pick.
export const ASSIGNABLE_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_LABELS).filter(([role]) => role !== "pending"),
);

const GRANTED_ROLES = new Set(Object.keys(ASSIGNABLE_ROLE_LABELS));

export function isRoleGranted(role: string | null | undefined): boolean {
  return !!role && GRANTED_ROLES.has(role);
}
