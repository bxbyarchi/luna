import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, housesTable, locationsTable, registersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireVenueRole } from "../middleware/rbac";
import { getWarehouseScope, locationExists } from "../lib/warehouseScope";
import { isVenueAdmin, canAccessVenueLocation } from "../lib/venueScope";

const router: IRouter = Router();

router.get("/houses", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const requestedLocation = isVenueAdmin(scope.role) && req.query.locationId ? Number(req.query.locationId) : scope.locationId;

  const conditions = requestedLocation ? [eq(housesTable.locationId, requestedLocation)] : [];
  const rows = await db
    .select({
      id: housesTable.id,
      name: housesTable.name,
      isActive: housesTable.isActive,
      locationId: housesTable.locationId,
      locationName: locationsTable.name,
      registerCount: sql<number>`COUNT(${registersTable.id})::int`,
      createdAt: housesTable.createdAt,
    })
    .from(housesTable)
    .leftJoin(locationsTable, eq(housesTable.locationId, locationsTable.id))
    .leftJoin(registersTable, eq(registersTable.houseId, housesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(housesTable.id, locationsTable.name)
    .orderBy(locationsTable.name, housesTable.name);
  res.json(rows);
});

router.post("/houses", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { name, locationId, isActive } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const locId = isVenueAdmin(scope.role) ? Number(locationId) : scope.locationId;
  if (!locId || !canAccessVenueLocation(scope, locId) || !(await locationExists(locId))) { res.status(400).json({ error: "Некорректная площадка" }); return; }
  const [row] = await db.insert(housesTable).values({ name, locationId: locId, isActive: isActive ?? true }).returning();
  await logAudit({ action: "create", entityType: "house", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.patch("/houses/:id", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const existing = await db.query.housesTable.findFirst({ where: eq(housesTable.id, id) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessVenueLocation(scope, existing.locationId)) { res.status(403).json({ error: "Нет доступа к этой площадке" }); return; }

  const { name, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (isActive !== undefined) updates.isActive = isActive;

  const [row] = await db.update(housesTable).set(updates).where(eq(housesTable.id, id)).returning();
  await logAudit({ action: "update", entityType: "house", entityId: id, clerkUserId: req.auth?.userId });
  res.json(row);
});

router.delete("/houses/:id", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const existing = await db.query.housesTable.findFirst({ where: eq(housesTable.id, id) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!canAccessVenueLocation(scope, existing.locationId)) { res.status(403).json({ error: "Нет доступа к этой площадке" }); return; }

  await db.delete(housesTable).where(eq(housesTable.id, id));
  await logAudit({ action: "delete", entityType: "house", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
