import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export type UserRole = "admin" | "manager" | "accountant" | "warehouse";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  accountant: 2,
  warehouse: 1,
};

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let user = await db.query.usersTable.findFirst({
      where: eq(usersTable.clerkUserId, clerkUserId),
    });

    if (!user) {
      const [{ count: userCount }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(usersTable)
        .catch(() => [{ count: 1 }]);

      const isFirstUser = Number(userCount) === 0;

      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId,
          email: `${clerkUserId}@unknown`,
          role: isFirstUser ? "admin" : "warehouse",
        })
        .onConflictDoNothing()
        .returning();

      user = created ?? await db.query.usersTable.findFirst({
        where: eq(usersTable.clerkUserId, clerkUserId),
      });
    }

    if (!user) {
      res.status(403).json({ error: "User record not found" });
      return;
    }

    const userRank = ROLE_HIERARCHY[user.role as UserRole] ?? 0;
    const hasRole = roles.some((r) => userRank >= ROLE_HIERARCHY[r]);

    if (!hasRole) {
      res.status(403).json({
        error: `Forbidden. Required roles: ${roles.join(", ")}. Your role: ${user.role}.`,
      });
      return;
    }

    next();
  };
}
