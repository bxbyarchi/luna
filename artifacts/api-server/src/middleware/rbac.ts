import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type UserRole = "super_admin" | "warehouse_chief" | "manager" | "accountant" | "warehouse" | "location_admin" | "cashier";

// Two independent hierarchies. super_admin sits at the top of both — everything
// else. warehouse_chief tops the warehouse track but has no venue/kassa access
// at all; location_admin/cashier top the venue track but have no warehouse access.
const WAREHOUSE_RANK: Partial<Record<UserRole, number>> = {
  super_admin: 4,
  warehouse_chief: 4,
  manager: 3,
  accountant: 2,
  warehouse: 1,
};

const VENUE_RANK: Partial<Record<UserRole, number>> = {
  super_admin: 3,
  location_admin: 2,
  cashier: 1,
};

async function resolveUser(req: Request, res: Response) {
  const clerkUserId = (req as Request & { auth?: { userId?: string } }).auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!user) {
    res.status(403).json({ error: "User record not found" });
    return null;
  }
  return user;
}

function requireRank(rankTable: Partial<Record<UserRole, number>>, roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await resolveUser(req, res);
    if (!user) return;

    const userRank = rankTable[user.role as UserRole] ?? 0;
    const minRank = Math.min(...roles.map((r) => rankTable[r] ?? 99));
    if (userRank < minRank) {
      res.status(403).json({ error: `Forbidden. Required roles: ${roles.join(", ")}. Your role: ${user.role}.` });
      return;
    }
    next();
  };
}

/** Gate by warehouse-track role rank (super_admin/warehouse_chief see everything on the warehouse side). */
export function requireRole(...roles: UserRole[]) {
  return requireRank(WAREHOUSE_RANK, roles);
}

/** Gate by venue/kassa-track role rank (super_admin sees everything, location_admin/cashier are scoped to their own venue). */
export function requireVenueRole(...roles: UserRole[]) {
  return requireRank(VENUE_RANK, roles);
}

/**
 * Exactly super_admin — not warehouse_chief, even though they share the top
 * warehouse rank. Use for cross-cutting actions that aren't scoped to either
 * track: the audit log, user/account management, org settings, structural
 * location edits, demo-data seeding.
 */
export function requireSuperAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await resolveUser(req, res);
    if (!user) return;
    if (user.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden. Required role: super_admin." });
      return;
    }
    next();
  };
}
