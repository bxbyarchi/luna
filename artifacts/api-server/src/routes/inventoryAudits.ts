import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { inventoryAuditsTable, auditItemsTable, itemsTable, warehouseStockTable, locationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { sendLowStockAlert } from "../lib/telegramBot";
import { getWarehouseScope, canAccessLocation, locationExists } from "../lib/warehouseScope";

const router: IRouter = Router();

async function syncLegacyTotal(tx: any, itemId: number) {
  await tx.update(itemsTable).set({
    currentStock: sql`COALESCE((SELECT SUM(CAST(${warehouseStockTable.currentStock} AS DECIMAL)) FROM ${warehouseStockTable} WHERE ${warehouseStockTable.itemId} = ${itemId}), 0)`,
  }).where(eq(itemsTable.id, itemId));
}

async function resolveLocation(req: Request, requested?: unknown) {
  const scope = await getWarehouseScope(req);
  const locationId = requested !== undefined && requested !== null && requested !== "" ? Number(requested) : scope.locationId;
  if (!Number.isInteger(locationId) || locationId <= 0) return { scope, locationId: null as number | null };
  if (!canAccessLocation(scope, locationId)) return { scope, locationId: null as number | null, forbidden: true };
  if (!(await locationExists(locationId))) return { scope, locationId: null as number | null, invalid: true };
  return { scope, locationId };
}

router.get("/inventory-audits", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  const requested = req.query.locationId ? Number(req.query.locationId) : scope.locationId;
  const conditions = [];
  if (scope.role !== "admin") {
    if (!requested) { res.status(403).json({ error: "Warehouse is not assigned" }); return; }
    conditions.push(eq(inventoryAuditsTable.locationId, requested));
  } else if (req.query.locationId) {
    conditions.push(eq(inventoryAuditsTable.locationId, Number(req.query.locationId)));
  }
  const rows = await db.select({
    id: inventoryAuditsTable.id,
    title: inventoryAuditsTable.title,
    locationId: inventoryAuditsTable.locationId,
    locationName: locationsTable.name,
    status: inventoryAuditsTable.status,
    createdAt: inventoryAuditsTable.createdAt,
    submittedAt: inventoryAuditsTable.submittedAt,
  }).from(inventoryAuditsTable)
    .leftJoin(locationsTable, eq(inventoryAuditsTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${inventoryAuditsTable.createdAt} DESC`);
  res.json(rows);
});

router.post("/inventory-audits", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { title, locationId: requestedLocation } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const resolved = await resolveLocation(req, requestedLocation);
  if (resolved.forbidden) { res.status(403).json({ error: "No access to this warehouse" }); return; }
  if (resolved.invalid) { res.status(400).json({ error: "Invalid warehouse" }); return; }
  if (!resolved.locationId) { res.status(400).json({ error: "locationId required" }); return; }

  const audit = await db.transaction(async (tx) => {
    const [created] = await tx.insert(inventoryAuditsTable).values({ title, locationId: resolved.locationId!, status: "draft" }).returning();
    const items = await tx.select({ itemId: itemsTable.id, stock: warehouseStockTable.currentStock })
      .from(itemsTable)
      .leftJoin(warehouseStockTable, and(eq(warehouseStockTable.itemId, itemsTable.id), eq(warehouseStockTable.locationId, resolved.locationId!)));
    if (items.length) {
      await tx.insert(auditItemsTable).values(items.map((item) => ({ auditId: created.id, itemId: item.itemId, systemStock: item.stock ?? "0", actualStock: null })));
    }
    return created;
  });
  await logAudit({ action: "create", entityType: "inventory_audit", entityId: audit.id, clerkUserId: req.auth?.userId });
  res.status(201).json(audit);
});

router.get("/inventory-audits/:id", requireAuth(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const audit = await db.query.inventoryAuditsTable.findFirst({ where: eq(inventoryAuditsTable.id, id) });
  if (!audit) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!canAccessLocation(scope, audit.locationId ?? -1)) { res.status(403).json({ error: "Forbidden" }); return; }

  const auditItems = await db.select({
    id: auditItemsTable.id,
    auditId: auditItemsTable.auditId,
    itemId: auditItemsTable.itemId,
    itemName: itemsTable.name,
    systemStock: auditItemsTable.systemStock,
    actualStock: auditItemsTable.actualStock,
    discrepancy: sql<string>`CASE WHEN ${auditItemsTable.actualStock} IS NOT NULL THEN CAST(${auditItemsTable.actualStock} AS DECIMAL) - CAST(${auditItemsTable.systemStock} AS DECIMAL) ELSE NULL END`,
  }).from(auditItemsTable)
    .leftJoin(itemsTable, eq(auditItemsTable.itemId, itemsTable.id))
    .where(eq(auditItemsTable.auditId, id));
  res.json({ ...audit, items: auditItems });
});

router.patch("/inventory-audits/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { items } = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: "items array required" }); return; }
  const existing = await db.query.inventoryAuditsTable.findFirst({ where: eq(inventoryAuditsTable.id, id) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!canAccessLocation(scope, existing.locationId ?? -1)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (existing.status === "submitted") { res.status(409).json({ error: "Инвентаризация уже завершена" }); return; }

  for (const item of items) {
    if (item.itemId !== undefined && item.actualStock !== undefined && Number(item.actualStock) >= 0) {
      await db.update(auditItemsTable).set({ actualStock: String(item.actualStock) }).where(and(eq(auditItemsTable.auditId, id), eq(auditItemsTable.itemId, Number(item.itemId))));
    }
  }
  const audit = await db.query.inventoryAuditsTable.findFirst({ where: eq(inventoryAuditsTable.id, id) });
  await logAudit({ action: "update", entityType: "inventory_audit", entityId: id, clerkUserId: req.auth?.userId, details: `Saved ${items.filter((i) => i.actualStock !== undefined).length} counts` });
  res.json(audit);
});

router.post("/inventory-audits/:id/submit", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const audit = await db.query.inventoryAuditsTable.findFirst({ where: eq(inventoryAuditsTable.id, id) });
  if (!audit) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!canAccessLocation(scope, audit.locationId ?? -1)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (audit.status === "submitted") { res.status(400).json({ error: "Already submitted" }); return; }

  const auditItems = await db.select().from(auditItemsTable).where(eq(auditItemsTable.auditId, id));
  await db.transaction(async (tx) => {
    for (const auditItem of auditItems) {
      if (auditItem.actualStock === null) continue;
      const actual = Number(auditItem.actualStock);
      const existingStock = await tx.query.warehouseStockTable.findFirst({ where: and(eq(warehouseStockTable.itemId, auditItem.itemId), eq(warehouseStockTable.locationId, audit.locationId!)) });
      if (existingStock) {
        await tx.update(warehouseStockTable).set({ currentStock: String(actual) }).where(eq(warehouseStockTable.id, existingStock.id));
      } else {
        await tx.insert(warehouseStockTable).values({ itemId: auditItem.itemId, locationId: audit.locationId!, currentStock: String(actual) });
      }
      await syncLegacyTotal(tx, auditItem.itemId);
      const [updatedItem] = await tx.select({ name: itemsTable.name, unit: itemsTable.unit, minThreshold: itemsTable.minThreshold }).from(itemsTable).where(eq(itemsTable.id, auditItem.itemId));
      if (updatedItem?.minThreshold !== null && actual <= Number(updatedItem.minThreshold)) {
        void sendLowStockAlert(updatedItem.name, actual, Number(updatedItem.minThreshold), updatedItem.unit ?? "ед.");
      }
    }
    await tx.update(inventoryAuditsTable).set({ status: "submitted", submittedAt: new Date() }).where(eq(inventoryAuditsTable.id, id));
  });

  const [row] = await db.select().from(inventoryAuditsTable).where(eq(inventoryAuditsTable.id, id));
  await logAudit({ action: "submit", entityType: "inventory_audit", entityId: id, clerkUserId: req.auth?.userId, details: `Applied ${auditItems.filter((i) => i.actualStock !== null).length} item counts` });
  res.json(row);
});

export default router;
