import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

interface ClerkUserResponse {
  email_addresses?: Array<{ email_address?: string }>;
  first_name?: string | null;
  last_name?: string | null;
  public_metadata?: { role?: string };
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

    const isFirstUser = Number(userCount) === 0;

    const validRoles = ["admin", "manager", "accountant", "warehouse"] as const;
    type AppRole = typeof validRoles[number];
    const metaRole = clerkUser?.public_metadata?.role;
    const role: AppRole = validRoles.includes(metaRole as AppRole)
      ? (metaRole as AppRole)
      : isFirstUser ? "admin" : "warehouse";

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

  res.json({
    clerkUserId: user.clerkUserId,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  });
});

export default router;
