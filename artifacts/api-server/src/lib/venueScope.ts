import { db, registersTable, housesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { WarehouseScope } from "./warehouseScope";

export async function getRegisterLocationId(registerId: number): Promise<number | null> {
  const [row] = await db
    .select({ locationId: housesTable.locationId })
    .from(registersTable)
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .where(eq(registersTable.id, registerId));
  return row?.locationId ?? null;
}

/** Only super_admin sees every venue — location_admin/cashier are scoped to their own location, same as warehouse manager/accountant/warehouse are on the warehouse side. */
export function isVenueAdmin(role: string): boolean {
  return role === "super_admin";
}

/** Venue-domain equivalent of warehouseScope's canAccessLocation — warehouse_chief must NOT get a pass here. */
export function canAccessVenueLocation(scope: WarehouseScope | null, locationId: number | null): boolean {
  return !!scope && locationId !== null && (isVenueAdmin(scope.role) || scope.locationId === locationId);
}
