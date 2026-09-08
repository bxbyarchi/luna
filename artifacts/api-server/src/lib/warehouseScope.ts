import { db, usersTable, locationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";

export type WarehouseScope = {
  userId: string;
  role: string;
  locationId: number | null;
};

export async function getWarehouseScope(req: Request): Promise<WarehouseScope | null> {
  const userId = req.auth?.userId;
  if (!userId) return null;

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, userId),
  });
  if (!user) return null;

  return { userId, role: user.role, locationId: user.locationId ?? null };
}

export function canAccessLocation(scope: WarehouseScope, locationId: number): boolean {
  return scope.role === "admin" || scope.locationId === locationId;
}

export async function requireWarehouseLocation(req: Request, locationId: number): Promise<WarehouseScope | null> {
  const scope = await getWarehouseScope(req);
  if (!scope || !canAccessLocation(scope, locationId)) return null;
  return scope;
}

export async function locationExists(locationId: number): Promise<boolean> {
  const row = await db.query.locationsTable.findFirst({ where: eq(locationsTable.id, locationId) });
  return !!row?.isActive;
}
