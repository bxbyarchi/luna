import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable, locationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

// Завхоз назначает сотруднику конкретный склад. Пустой locationId снимает назначение.
router.patch("/admin/users/:id/location", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const id = Number(req.params.id);
  const rawLocationId = req.body?.locationId;
  const locationId = rawLocationId === null || rawLocationId === "" || rawLocationId === undefined
    ? null
    : Number(rawLocationId);

  if (locationId !== null && (!Number.isInteger(locationId) || locationId <= 0)) {
    res.status(400).json({ error: "Некорректный склад" });
    return;
  }

  if (locationId !== null) {
    const location = await db.query.locationsTable.findFirst({ where: eq(locationsTable.id, locationId) });
    if (!location || !location.isActive) {
      res.status(400).json({ error: "Склад не найден или отключён" });
      return;
    }
  }

  const [updated] = await db.update(usersTable)
    .set({ locationId })
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(updated);
});

export default router;
