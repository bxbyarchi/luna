import { db, registersTable, housesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getRegisterLocationId(registerId: number): Promise<number | null> {
  const [row] = await db
    .select({ locationId: housesTable.locationId })
    .from(registersTable)
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .where(eq(registersTable.id, registerId));
  return row?.locationId ?? null;
}
