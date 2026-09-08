import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable, locationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

interface ClerkUserResponse {
  email_addresses?: Array<{ email_address?: string }>;
  first_name?: string | null;
  last_name?: string | null;
}

const router: IRouter = Router();

router.get("/auth/me", requireAuth(), async (req: Request, res: Response) => {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });

  if (!user) {
    const clerkUser = await fetch(
      `https://api.clerk.com/v1/users/${clerkUserId}`,
      { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
    ).then((r) => r.json() as Promise<ClerkUserResponse>);

    const email =
      clerkUser?.email_addresses?.[0]?.email_address ?? `${clerkUserId}@unknown`;

    const [{ count: userCount }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(usersTable)
      .catch(() => [{ count: 0 }]);

    // Only the very first account becomes Завхоз. Every subsequent account
    // starts as a warehouse user and must be assigned by an administrator.
    const role = Number(userCount) === 0 ? "admin" : "warehouse";

    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email,
        role,
        firstName: clerkUser?.first_name ?? null,
        lastName: clerkUser?.last_name ?? null,
      })
      .onConflictDoNothing()
      .returning();

    if (!user) {
      user = await db.query.usersTable.findFirst({
        where: eq(usersTable.clerkUserId, clerkUserId),
      });
    }
  }

  if (!user) {
    res.status(500).json({ error: "Failed to find or create user" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

  let locationName: string | null = null;
  if (user.locationId) {
    const location = await db.query.locationsTable.findFirst({
      where: eq(locationsTable.id, user.locationId),
    });
    locationName = location?.name ?? null;
  }

  res.json({
    clerkUserId: user.clerkUserId,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    telegramChatId: user.telegramChatId ?? null,
    locationId: user.locationId ?? null,
    locationName,
  });
});

export default router;
