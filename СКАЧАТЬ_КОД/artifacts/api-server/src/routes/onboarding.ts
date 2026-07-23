import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const VALID_ROLES = ["admin", "manager", "accountant", "warehouse"] as const;
type AppRole = typeof VALID_ROLES[number];

router.post("/auth/set-role", requireAuth(), async (req: Request, res: Response) => {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { role } = req.body as { role?: string };
  if (!role || !VALID_ROLES.includes(role as AppRole)) {
    res.status(400).json({ error: "Invalid role. Must be one of: " + VALID_ROLES.join(", ") });
    return;
  }

  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });

  if (!user) {
    res.status(404).json({ error: "User not found. Call /api/auth/me first to create your account." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role: role as AppRole })
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .returning();

  res.json({ role: updated.role });
});

export default router;
