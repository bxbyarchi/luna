import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
    ).then((r) => r.json());

    const email =
      clerkUser?.email_addresses?.[0]?.email_address ?? `${clerkUserId}@unknown`;

    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email,
        role: "warehouse",
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
