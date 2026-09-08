import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { receiptsTable, itemsTable, usersTable, warehouseStockTable, locationsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { sendLowStockAlert } from "../lib/telegramBot";
import { getWarehouseScope, locationExists } from "../lib/warehouseScope";

const router: IRouter = Router();

async function resolveLocationId(req: Request, requested?: unknown): Promise<number | null> {
  const scope = await getWarehouseScope(req);
  if (!scope) return null;
  if (scope.role !== "admin") return scope.locationId;
  const id = requested == null || requested === "" ? null : Number(requested);
  if (id && await locationExists(id)) return id;
  const first = await db.query.locationsTable.findFirst({ where: eq(locationsTable.isActive, true), orderBy: [asc(locationsTable.id)] });
  return first?.id ?? null;
}

async function refreshLegacyStock(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], itemId: number) {
  return tx.select({ total: sql<string>`COALESCE(SUM(CAST(${warehouseStockTable.currentStock} AS DECIMAL)),0)` }).from(warehouseStockTable).where(eq(warehouseStockTable.itemId, itemId));
}

router.get("/receipts", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { itemId, from, to, locationId } = req.query;
  const selectedLocation = scope.role === "admin" && locationId ? Number(locationId) : scope.locationId;
  const conditions = [];
  if (itemId) conditions.push(eq(receiptsTable.itemId, Number(itemId)));
  if (from) conditions.push(gte(receiptsTable.createdAt, new Date(String(from))));
  if (to) conditions.push(lte(receiptsTable.createdAt, new Date(String(to))));
  if (selectedLocation) conditions.push(eq(receiptsTable.locationId, selectedLocation));
  const rows = await db.select({ id: receiptsTable.id, itemId: receiptsTable.itemId, itemName: itemsTable.name, locationId: receiptsTable.locationId, locationName: locationsTable.name, quantity: receiptsTable.quantity, pricePerUnit: receiptsTable.pricePerUnit, totalCost: receiptsTable.totalCost, supplier: receiptsTable.supplier, photoUrl: receiptsTable.photoUrl, photoUrls: receiptsTable.photoUrls, notes: receiptsTable.notes, createdAt: receiptsTable.createdAt, recordedByName: sql<string | null>`NULLIF(TRIM(COALESCE(${usersTable.firstName}, '') || ' ' || COALESCE(${usersTable.lastName}, '')), '')` }).from(receiptsTable).leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id)).leftJoin(usersTable, eq(receiptsTable.recordedByClerkId, usersTable.clerkUserId)).leftJoin(locationsTable, eq(receiptsTable.locationId, locationsTable.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(sql`${receiptsTable.createdAt} DESC`);
  res.json(rows);
});

router.post("/receipts", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { itemId, quantity, pricePerUnit, supplier, photoUrl, photoUrls, notes, locationId } = req.body;
  if (!itemId || !quantity || pricePerUnit === undefined) { res.status(400).json({ error: "itemId, quantity, pricePerUnit required" }); return; }
  const qty = Number(quantity), price = Number(pricePerUnit);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) { res.status(400).json({ error: "Некорректное количество или цена" }); return; }
  const warehouseId = await resolveLocationId(req, locationId);
  if (!warehouseId) { res.status(400).json({ error: "Не выбран склад" }); return; }
  const total = qty * price;
  const normalizedPhotoUrls: string[] = Array.isArray(photoUrls) ? photoUrls : (photoUrl ? [photoUrl] : []);
  const primaryPhotoUrl = normalizedPhotoUrls[0] ?? photoUrl ?? null;
  const [row] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(receiptsTable).values({ itemId: Number(itemId), locationId: warehouseId, quantity: String(qty), pricePerUnit: String(price), totalCost: String(total), supplier, photoUrl: primaryPhotoUrl, photoUrls: normalizedPhotoUrls, notes, recordedByClerkId: req.auth?.userId }).returning();
    await tx.insert(warehouseStockTable).values({ itemId: Number(itemId), locationId: warehouseId, currentStock: String(qty) }).onConflictDoUpdate({ target: [warehouseStockTable.itemId, warehouseStockTable.locationId], set: { currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) + ${qty}` } });
    const [{ total: legacyTotal }] = await refreshLegacyStock(tx, Number(itemId));
    await tx.update(itemsTable).set({ currentStock: legacyTotal }).where(eq(itemsTable.id, Number(itemId)));
    return [created];
  });
  const [updated] = await db.select({ currentStock: warehouseStockTable.currentStock, minThreshold: itemsTable.minThreshold, name: itemsTable.name, unit: itemsTable.unit }).from(warehouseStockTable).leftJoin(itemsTable, eq(warehouseStockTable.itemId, itemsTable.id)).where(and(eq(warehouseStockTable.itemId, Number(itemId)), eq(warehouseStockTable.locationId, warehouseId)));
  if (updated?.minThreshold && Number(updated.currentStock) <= Number(updated.minThreshold)) void sendLowStockAlert(updated.name, Number(updated.currentStock), Number(updated.minThreshold), updated.unit);
  await logAudit({ action: "create", entityType: "receipt", entityId: row.id, clerkUserId: req.auth?.userId, details: `Склад: ${warehouseId}` });
  res.status(201).json(row);
});

router.get("/receipts/:id", requireAuth(), async (req: Request, res: Response) => {
  const [row] = await db.select({ id: receiptsTable.id, itemId: receiptsTable.itemId, itemName: itemsTable.name, locationId: receiptsTable.locationId, locationName: locationsTable.name, quantity: receiptsTable.quantity, pricePerUnit: receiptsTable.pricePerUnit, totalCost: receiptsTable.totalCost, supplier: receiptsTable.supplier, photoUrl: receiptsTable.photoUrl, photoUrls: receiptsTable.photoUrls, notes: receiptsTable.notes, createdAt: receiptsTable.createdAt }).from(receiptsTable).leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id)).leftJoin(locationsTable, eq(receiptsTable.locationId, locationsTable.id)).where(eq(receiptsTable.id, Number(req.params.id)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!scope || (scope.role !== "admin" && row.locationId !== scope.locationId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(row);
});

router.patch("/receipts/:id", requireAuth(), requireRole("manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!scope || (scope.role !== "admin" && existing.locationId !== scope.locationId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { quantity, pricePerUnit, supplier, photoUrl, photoUrls, notes } = req.body;
  const oldQty = Number(existing.quantity), newQty = quantity !== undefined ? Number(quantity) : oldQty;
  const newPrice = pricePerUnit !== undefined ? Number(pricePerUnit) : Number(existing.pricePerUnit);
  if (!Number.isFinite(newQty) || newQty <= 0 || !Number.isFinite(newPrice) || newPrice < 0) { res.status(400).json({ error: "Некорректные данные" }); return; }
  const newTotal = newQty * newPrice;
  const normalizedPhotoUrls = photoUrls !== undefined ? (Array.isArray(photoUrls) ? photoUrls : (photoUrl ? [photoUrl] : [])) : undefined;
  const primaryPhotoUrl = normalizedPhotoUrls !== undefined ? (normalizedPhotoUrls[0] ?? null) : (photoUrl !== undefined ? photoUrl : existing.photoUrl);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(receiptsTable).set({ ...(quantity !== undefined && { quantity: String(newQty) }), ...(pricePerUnit !== undefined && { pricePerUnit: String(newPrice) }), totalCost: String(newTotal), ...(supplier !== undefined && { supplier }), ...(photoUrl !== undefined || photoUrls !== undefined ? { photoUrl: primaryPhotoUrl } : {}), ...(normalizedPhotoUrls !== undefined && { photoUrls: normalizedPhotoUrls }), ...(notes !== undefined && { notes }) }).where(eq(receiptsTable.id, id)).returning();
    if (quantity !== undefined && existing.locationId) {
      const delta = newQty - oldQty;
      await tx.insert(warehouseStockTable).values({ itemId: existing.itemId, locationId: existing.locationId, currentStock: String(delta) }).onConflictDoUpdate({ target: [warehouseStockTable.itemId, warehouseStockTable.locationId], set: { currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) + ${delta}` } });
      const [{ total }] = await refreshLegacyStock(tx, existing.itemId);
      await tx.update(itemsTable).set({ currentStock: total }).where(eq(itemsTable.id, existing.itemId));
    }
    return row;
  });
  await logAudit({ action: "update", entityType: "receipt", entityId: id, clerkUserId: req.auth?.userId });
  res.json(updated);
});

router.delete("/receipts/:id", requireAuth(), requireRole("manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const scope = await getWarehouseScope(req);
  if (!scope || (scope.role !== "admin" && existing.locationId !== scope.locationId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const qty = Number(existing.quantity);
  await db.transaction(async (tx) => {
    await tx.delete(receiptsTable).where(eq(receiptsTable.id, id));
    if (existing.locationId) await tx.update(warehouseStockTable).set({ currentStock: sql`GREATEST(0, CAST(${warehouseStockTable.currentStock} AS DECIMAL) - ${qty})` }).where(and(eq(warehouseStockTable.itemId, existing.itemId), eq(warehouseStockTable.locationId, existing.locationId)));
    const [{ total }] = await refreshLegacyStock(tx, existing.itemId);
    await tx.update(itemsTable).set({ currentStock: total }).where(eq(itemsTable.id, existing.itemId));
  });
  await logAudit({ action: "delete", entityType: "receipt", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).send();
});

export default router;
