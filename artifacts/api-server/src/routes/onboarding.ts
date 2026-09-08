import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/auth/set-role", requireAuth(), async (req: Request, res: Response) => {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Roles are assigned by the administrator. Self-service role changes would allow
  // any authenticated user to promote themselves to admin/manager.
  res.status(403).json({ error: "Роль назначает Завхоз. Обратитесь к администратору." });
});

export default router;
