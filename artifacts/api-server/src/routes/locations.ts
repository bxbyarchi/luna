import { Router, type IRouter, type Request, type Response } from "express";
import { db, locationsTable, DEFAULT_LOCATIONS, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = req.auth?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, userId) });
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

router.get("/locations", requireAuth(), async (_req, res: Response) => {
  let locations = await db.query.locationsTable.findMany({ where: eq(locationsTable.isActive, true), orderBy: [asc(locationsTable.id)] });
  if (locations.length === 0) {
    await db.insert(locationsTable).values(DEFAULT_LOCATIONS).onConflictDoNothing();
    locations = await db.query.locationsTable.findMany({ where: eq(locationsTable.isActive, true), orderBy: [asc(locationsTable.id)] });
  }
  res.json(locations);
});

router.patch("/locations/:id", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const { name, isActive } = req.body as { name?: string; isActive?: boolean };
  const [updated] = await db.update(locationsTable).set({
    ...(name !== undefined ? { name: name.trim() } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  }).where(eq(locationsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Location not found" }); return; }
  res.json(updated);
});

export default router;
