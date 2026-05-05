import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

router.get("/categories", requireAuth(), async (req: Request, res: Response) => {
  const rows = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  res.json(rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, description: r.description })));
});

router.post("/categories", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const { name, slug, description } = req.body;
  if (!name || !slug) {
    res.status(400).json({ error: "name and slug required" });
    return;
  }
  const [row] = await db.insert(categoriesTable).values({ name, slug, description }).returning();
  await logAudit({ action: "create", entityType: "category", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.patch("/categories/:id", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, slug, description } = req.body;
  const [row] = await db
    .update(categoriesTable)
    .set({ name, slug, description })
    .where(eq(categoriesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "update", entityType: "category", entityId: id, clerkUserId: req.auth?.userId });
  res.json(row);
});

router.delete("/categories/:id", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db.delete(categoriesTable).where(eq(categoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "delete", entityType: "category", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
