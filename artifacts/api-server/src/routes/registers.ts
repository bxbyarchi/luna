import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, registersTable, housesTable, locationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { getWarehouseScope } from "../lib/warehouseScope";

const router: IRouter = Router();

router.get("/registers", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const requestedLocation = scope.role === "admin" && req.query.locationId ? Number(req.query.locationId) : scope.locationId;

  const conditions = [];
  if (requestedLocation) conditions.push(eq(housesTable.locationId, requestedLocation));
  if (req.query.houseId) conditions.push(eq(registersTable.houseId, Number(req.query.houseId)));

  const rows = await db
    .select({
      id: registersTable.id,
      name: registersTable.name,
      isActive: registersTable.isActive,
      houseId: registersTable.houseId,
      houseName: housesTable.name,
      locationId: housesTable.locationId,
      locationName: locationsTable.name,
      createdAt: registersTable.createdAt,
    })
    .from(registersTable)
    .leftJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .leftJoin(locationsTable, eq(housesTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(locationsTable.name, housesTable.name, registersTable.name);
  res.json(rows);
});

router.post("/registers", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { name, houseId, isActive } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const hId = Number(houseId);
  const house = hId ? await db.query.housesTable.findFirst({ where: eq(housesTable.id, hId) }) : null;
  if (!house) { res.status(400).json({ error: "Некорректный домик" }); return; }
  const [row] = await db.insert(registersTable).values({ name, houseId: hId, isActive: isActive ?? true }).returning();
  await logAudit({ action: "create", entityType: "register", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.patch("/registers/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (isActive !== undefined) updates.isActive = isActive;

  const [row] = await db.update(registersTable).set(updates).where(eq(registersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "update", entityType: "register", entityId: id, clerkUserId: req.auth?.userId });
  res.json(row);
});

router.delete("/registers/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db.delete(registersTable).where(eq(registersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "delete", entityType: "register", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
