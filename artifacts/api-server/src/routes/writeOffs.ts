import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { writeOffsTable, itemsTable, staffTable, categoriesTable, warehouseStockTable, locationsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { sendLowStockAlert, sendHozkaLowStockAlert, sendWriteOffNotification } from "../lib/telegramBot";
import { getWarehouseScope, canAccessLocation, locationExists } from "../lib/warehouseScope";

const router: IRouter = Router();

async function resolveLocation(req: Request, requested?: unknown) {
  const scope = await getWarehouseScope(req);
  if (!scope) return { scope, locationId: null as number | null, unauthorized: true };
  const locationId = requested !== undefined && requested !== null && requested !== "" ? Number(requested) : scope.locationId;
  if (!Number.isInteger(locationId) || locationId <= 0) return { scope, locationId: null as number | null };
  if (!canAccessLocation(scope, locationId)) return { scope, locationId: null as number | null, forbidden: true };
  if (!(await locationExists(locationId))) return { scope, locationId: null as number | null, invalid: true };
  return { scope, locationId };
}

async function syncLegacyTotal(tx: any, itemId: number) {
  await tx.update(itemsTable).set({ currentStock: sql`COALESCE((SELECT SUM(CAST(${warehouseStockTable.currentStock} AS DECIMAL)) FROM ${warehouseStockTable} WHERE ${warehouseStockTable.itemId} = ${itemId}), 0)` }).where(eq(itemsTable.id, itemId));
}

router.get("/write-offs", requireAuth(), async (req: Request, res: Response) => {
  const { itemId, staffId, from, to, locationId } = req.query;
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const conditions = [];
  if (itemId) conditions.push(eq(writeOffsTable.itemId, Number(itemId)));
  if (staffId) conditions.push(eq(writeOffsTable.staffId, Number(staffId)));
  if (from) conditions.push(gte(writeOffsTable.createdAt, new Date(String(from))));
  if (to) conditions.push(lte(writeOffsTable.createdAt, new Date(String(to))));
  const requestedLocation = locationId ? Number(locationId) : scope.locationId;
  if (scope.role !== "admin") {
    if (!requestedLocation || !canAccessLocation(scope, requestedLocation)) { res.status(403).json({ error: "Warehouse is not assigned" }); return; }
    conditions.push(eq(writeOffsTable.locationId, requestedLocation));
  } else if (locationId) conditions.push(eq(writeOffsTable.locationId, Number(locationId)));
  const rows = await db.select({ id: writeOffsTable.id, itemId: writeOffsTable.itemId, itemName: itemsTable.name, locationId: writeOffsTable.locationId, locationName: locationsTable.name, quantity: writeOffsTable.quantity, reason: writeOffsTable.reason, staffId: writeOffsTable.staffId, staffName: staffTable.name, photoUrl: writeOffsTable.photoUrl, notes: writeOffsTable.notes, totalValue: writeOffsTable.totalValue, createdAt: writeOffsTable.createdAt }).from(writeOffsTable).leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id)).leftJoin(staffTable, eq(writeOffsTable.staffId, staffTable.id)).leftJoin(locationsTable, eq(writeOffsTable.locationId, locationsTable.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(sql`${writeOffsTable.createdAt} DESC`);
  res.json(rows);
});

router.post("/write-offs", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { itemId, quantity, reason, staffId, photoUrl, notes, locationId: requestedLocation } = req.body;
  if (!itemId || !quantity || !reason) { res.status(400).json({ error: "itemId, quantity, reason required" }); return; }
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: "quantity must be a positive number" }); return; }
  const resolved = await resolveLocation(req, requestedLocation);
  if (resolved.unauthorized) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  if (resolved.forbidden) { res.status(403).json({ error: "No access to this warehouse" }); return; }
  if (resolved.invalid) { res.status(400).json({ error: "Invalid warehouse" }); return; }
  if (!resolved.locationId) { res.status(400).json({ error: "locationId required" }); return; }
  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, Number(itemId)) });
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  const totalValue = Number(item.pricePerUnit) * qty;
  let result: { row: typeof writeOffsTable.$inferSelect; currentStock: number };
  try {
    result = await db.transaction(async (tx) => {
      const stock = await tx.query.warehouseStockTable.findFirst({ where: and(eq(warehouseStockTable.itemId, Number(itemId)), eq(warehouseStockTable.locationId, resolved.locationId!)) });
      const current = Number(stock?.currentStock ?? 0);
      if (!stock || current < qty) throw new Error("INSUFFICIENT_STOCK");
      const [created] = await tx.insert(writeOffsTable).values({ itemId: Number(itemId), locationId: resolved.locationId!, quantity: String(qty), reason, staffId: staffId ? Number(staffId) : null, photoUrl: photoUrl || null, notes, totalValue: String(totalValue), recordedByClerkId: req.auth?.userId }).returning();
      const nextStock = current - qty;
      await tx.update(warehouseStockTable).set({ currentStock: String(nextStock) }).where(eq(warehouseStockTable.id, stock.id));
      await syncLegacyTotal(tx, Number(itemId));
      return { row: created, currentStock: nextStock };
    });
  } catch (error: any) {
    if (error?.message === "INSUFFICIENT_STOCK") { res.status(400).json({ error: "Insufficient stock in selected warehouse" }); return; }
    throw error;
  }
  const [updated] = await db.select({ minThreshold: itemsTable.minThreshold, name: itemsTable.name, unit: itemsTable.unit, categoryName: categoriesTable.name, categorySlug: categoriesTable.slug }).from(itemsTable).leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id)).where(eq(itemsTable.id, Number(itemId)));
  if (updated?.minThreshold && result.currentStock <= Number(updated.minThreshold)) {
    const isHozka = updated.categoryName?.toLowerCase().includes("хозка") || updated.categorySlug?.toLowerCase().includes("hozka") || updated.categorySlug?.toLowerCase().includes("hoz");
    if (isHozka) void sendHozkaLowStockAlert(updated.name, result.currentStock, updated.unit);
    else void sendLowStockAlert(updated.name, result.currentStock, Number(updated.minThreshold), updated.unit);
  }
  let staffName: string | null = null;
  if (staffId) { const [staffRow] = await db.select({ name: staffTable.name }).from(staffTable).where(eq(staffTable.id, Number(staffId))); staffName = staffRow?.name ?? null; }
  void sendWriteOffNotification({ itemName: item.name, unit: item.unit, quantity: qty, reason, totalValue, staffName, recordedByName: null });
  await logAudit({ action: "create", entityType: "write_off", entityId: result.row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(result.row);
});

router.get("/write-offs/:id", requireAuth(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db.select({ id: writeOffsTable.id, itemId: writeOffsTable.itemId, itemName: itemsTable.name, locationId: writeOffsTable.locationId, locationName: locationsTable.name, quantity: writeOffsTable.quantity, reason: writeOffsTable.reason, staffId: writeOffsTable.staffId, staffName: staffTable.name, photoUrl: writeOffsTable.photoUrl, notes: writeOffsTable.notes, totalValue: writeOffsTable.totalValue, createdAt: writeOffsTable.createdAt }).from(writeOffsTable).leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id)).leftJoin(staffTable, eq(writeOffsTable.staffId, staffTable.id)).leftJoin(locationsTable, eq(writeOffsTable.locationId, locationsTable.id)).where(eq(writeOffsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!scope || !canAccessLocation(scope, row.locationId ?? -1)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(row);
});

router.patch("/write-offs/:id", requireAuth(), requireRole("manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(writeOffsTable).where(eq(writeOffsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!scope || !canAccessLocation(scope, existing.locationId ?? -1)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { quantity, reason, staffId, photoUrl, notes } = req.body;
  if (quantity !== undefined && (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) { res.status(400).json({ error: "quantity must be a positive number" }); return; }
  const oldQty = Number(existing.quantity), newQty = quantity !== undefined ? Number(quantity) : oldQty, qtyDelta = newQty - oldQty;
  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, existing.itemId) });
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  const newTotalValue = Number(item.pricePerUnit) * newQty;
  try {
    const updated = await db.transaction(async (tx) => {
      if (qtyDelta > 0) {
        const stock = await tx.query.warehouseStockTable.findFirst({ where: and(eq(warehouseStockTable.itemId, existing.itemId), eq(warehouseStockTable.locationId, existing.locationId!)) });
        if (!stock || Number(stock.currentStock) < qtyDelta) throw new Error("INSUFFICIENT_STOCK");
        await tx.update(warehouseStockTable).set({ currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) - ${qtyDelta}` }).where(eq(warehouseStockTable.id, stock.id));
      } else if (qtyDelta < 0) {
        await tx.update(warehouseStockTable).set({ currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) + ${Math.abs(qtyDelta)}` }).where(and(eq(warehouseStockTable.itemId, existing.itemId), eq(warehouseStockTable.locationId, existing.locationId!)));
      }
      const [row] = await tx.update(writeOffsTable).set({ ...(quantity !== undefined && { quantity: String(newQty), totalValue: String(newTotalValue) }), ...(reason !== undefined && { reason }), ...(staffId !== undefined && { staffId: staffId ? Number(staffId) : null }), ...(photoUrl !== undefined && { photoUrl }), ...(notes !== undefined && { notes }) }).where(eq(writeOffsTable.id, id)).returning();
      await syncLegacyTotal(tx, existing.itemId);
      return row;
    });
    await logAudit({ action: "update", entityType: "write_off", entityId: id, clerkUserId: req.auth?.userId });
    res.json(updated);
  } catch (error: any) {
    if (error?.message === "INSUFFICIENT_STOCK") { res.status(400).json({ error: "Insufficient stock in warehouse" }); return; }
    throw error;
  }
});

router.delete("/write-offs/:id", requireAuth(), requireRole("manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(writeOffsTable).where(eq(writeOffsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!scope || !canAccessLocation(scope, existing.locationId ?? -1)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.transaction(async (tx) => {
    await tx.delete(writeOffsTable).where(eq(writeOffsTable.id, id));
    await tx.update(warehouseStockTable).set({ currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) + ${Number(existing.quantity)}` }).where(and(eq(warehouseStockTable.itemId, existing.itemId), eq(warehouseStockTable.locationId, existing.locationId!)));
    await syncLegacyTotal(tx, existing.itemId);
  });
  await logAudit({ action: "delete", entityType: "write_off", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).send();
});

export default router;
