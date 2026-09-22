import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, staffTable, locationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { getWarehouseScope, locationExists } from "../lib/warehouseScope";

const router: IRouter = Router();

async function resolveLocationId(req: Request, requested?: unknown): Promise<number | null> {
  const scope = await getWarehouseScope(req);
  if (!scope) return null;
  if (scope.role !== "admin") return scope.locationId;
  const id = requested == null || requested === "" ? null : Number(requested);
  if (id && await locationExists(id)) return id;
  return null;
}

router.get("/staff", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const requestedLocation = scope.role === "admin" && req.query.locationId ? Number(req.query.locationId) : scope.locationId;

  const conditions = requestedLocation ? [eq(staffTable.locationId, requestedLocation)] : [];
  const rows = await db
    .select({
      id: staffTable.id,
      name: staffTable.name,
      position: staffTable.position,
      phone: staffTable.phone,
      isActive: staffTable.isActive,
      locationId: staffTable.locationId,
      locationName: locationsTable.name,
      createdAt: staffTable.createdAt,
    })
    .from(staffTable)
    .leftJoin(locationsTable, eq(staffTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(staffTable.name);
  res.json(rows);
});

router.post("/staff", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { name, position, phone, isActive, locationId } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const resolvedLocationId = await resolveLocationId(req, locationId);
  const [row] = await db.insert(staffTable).values({ name, position, phone, isActive: isActive ?? true, locationId: resolvedLocationId }).returning();
  await logAudit({ action: "create", entityType: "staff", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.patch("/staff/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, position, phone, isActive, locationId } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (position !== undefined) updates.position = position;
  if (phone !== undefined) updates.phone = phone;
  if (isActive !== undefined) updates.isActive = isActive;
  if (locationId !== undefined) updates.locationId = await resolveLocationId(req, locationId);

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
