import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { staffTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

router.get("/staff", requireAuth(), async (req: Request, res: Response) => {
  const rows = await db.select().from(staffTable).orderBy(staffTable.name);
  res.json(rows);
});

router.post("/staff", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { name, position, phone, isActive } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(staffTable).values({ name, position, phone, isActive: isActive ?? true }).returning();
  await logAudit({ action: "create", entityType: "staff", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.patch("/staff/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, position, phone, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (position !== undefined) updates.position = position;
  if (phone !== undefined) updates.phone = phone;
  if (isActive !== undefined) updates.isActive = isActive;

  const [row] = await db.update(staffTable).set(updates).where(eq(staffTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "update", entityType: "staff", entityId: id, clerkUserId: req.auth?.userId });
  res.json(row);
});

router.delete("/staff/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db.delete(staffTable).where(eq(staffTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "delete", entityType: "staff", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
