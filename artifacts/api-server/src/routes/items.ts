import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, itemsTable, categoriesTable, warehouseStockTable, locationsTable } from "@workspace/db";
import { eq, sql, and, ilike, asc } from "drizzle-orm";
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

router.get("/items", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { categoryId, belowThreshold, search, locationId } = req.query;
  const requestedLocation = scope.role === "admin" && locationId ? Number(locationId) : scope.locationId;
  const conditions = [];
  if (categoryId) conditions.push(eq(itemsTable.categoryId, Number(categoryId)));
  if (search) conditions.push(ilike(itemsTable.name, `%${search}%`));
  if (requestedLocation) conditions.push(eq(warehouseStockTable.locationId, requestedLocation));

  const rows = await db.select({
    id: itemsTable.id,
    name: itemsTable.name,
    categoryId: itemsTable.categoryId,
    categoryName: categoriesTable.name,
    unit: itemsTable.unit,
    location: sql<string | null>`${locationsTable.name}`,
    currentStock: sql<string>`COALESCE(${warehouseStockTable.currentStock}, 0)`,
    minThreshold: itemsTable.minThreshold,
    pricePerUnit: itemsTable.pricePerUnit,
    photoUrl: itemsTable.photoUrl,
    notes: itemsTable.notes,
    isBelowThreshold: sql<boolean>`CASE WHEN ${itemsTable.minThreshold} IS NOT NULL AND COALESCE(CAST(${warehouseStockTable.currentStock} AS DECIMAL),0) <= CAST(${itemsTable.minThreshold} AS DECIMAL) THEN true ELSE false END`.as("is_below_threshold"),
  }).from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .leftJoin(warehouseStockTable, and(eq(warehouseStockTable.itemId, itemsTable.id), requestedLocation ? eq(warehouseStockTable.locationId, requestedLocation) : sql`true`))
    .leftJoin(locationsTable, eq(warehouseStockTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(itemsTable.name);

  const filtered = belowThreshold === "true" ? rows.filter((r) => r.isBelowThreshold) : rows;
  res.json(filtered);
});

router.post("/items", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { name, categoryId, unit, location, locationId, currentStock, minThreshold, pricePerUnit, photoUrl, notes } = req.body;
  if (!name || !categoryId) { res.status(400).json({ error: "name and categoryId required" }); return; }
  const stock = Number(currentStock ?? 0);
  if (!Number.isFinite(stock) || stock < 0) { res.status(400).json({ error: "Некорректный остаток" }); return; }
  const warehouseId = await resolveLocationId(req, locationId);
  if (!warehouseId) { res.status(400).json({ error: "Не найден склад для начального остатка" }); return; }

  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(itemsTable).values({
      name, categoryId: Number(categoryId), unit: unit ?? "шт", location: location ?? null, notes,
      currentStock: String(stock), minThreshold: minThreshold != null ? String(minThreshold) : null,
      pricePerUnit: String(pricePerUnit ?? 0), photoUrl,
    }).returning();
    await tx.insert(warehouseStockTable).values({ itemId: created.id, locationId: warehouseId, currentStock: String(stock) }).onConflictDoUpdate({ target: [warehouseStockTable.itemId, warehouseStockTable.locationId], set: { currentStock: String(stock) } });
    return created;
  });
  await logAudit({ action: "create", entityType: "item", entityId: row.id, clerkUserId: req.auth?.userId, details: `Начальный остаток: ${stock}, склад ${warehouseId}` });
  res.status(201).json(row);
});

router.get("/items/:id", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const requestedLocation = scope.role === "admin" && req.query.locationId ? Number(req.query.locationId) : scope.locationId;
  const [row] = await db.select({
    id: itemsTable.id, name: itemsTable.name, categoryId: itemsTable.categoryId, categoryName: categoriesTable.name,
    unit: itemsTable.unit, location: sql<string | null>`${locationsTable.name}`,
    currentStock: sql<string>`COALESCE(${warehouseStockTable.currentStock}, 0)`, minThreshold: itemsTable.minThreshold,
    pricePerUnit: itemsTable.pricePerUnit, photoUrl: itemsTable.photoUrl, notes: itemsTable.notes,
    isBelowThreshold: sql<boolean>`CASE WHEN ${itemsTable.minThreshold} IS NOT NULL AND COALESCE(CAST(${warehouseStockTable.currentStock} AS DECIMAL),0) <= CAST(${itemsTable.minThreshold} AS DECIMAL) THEN true ELSE false END`,
  }).from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .leftJoin(warehouseStockTable, and(eq(warehouseStockTable.itemId, itemsTable.id), requestedLocation ? eq(warehouseStockTable.locationId, requestedLocation) : sql`true`))
    .leftJoin(locationsTable, eq(warehouseStockTable.locationId, locationsTable.id))
    .where(eq(itemsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/items/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, categoryId, unit, location, locationId, currentStock, minThreshold, pricePerUnit, photoUrl, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (categoryId !== undefined) updates.categoryId = Number(categoryId);
  if (unit !== undefined) updates.unit = unit;
  if (location !== undefined) updates.location = location;
  if (minThreshold !== undefined) updates.minThreshold = minThreshold != null ? String(minThreshold) : null;
  if (pricePerUnit !== undefined) updates.pricePerUnit = String(pricePerUnit);
  if (photoUrl !== undefined) updates.photoUrl = photoUrl;
  if (notes !== undefined) updates.notes = notes;

  const warehouseId = await resolveLocationId(req, locationId);
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(itemsTable).set(updates).where(eq(itemsTable.id, id)).returning();
    if (!updated) return null;
    if (currentStock !== undefined) {
      const stock = Number(currentStock);
      if (!Number.isFinite(stock) || stock < 0 || !warehouseId) throw new Error("Некорректный остаток или склад");
      await tx.insert(warehouseStockTable).values({ itemId: id, locationId: warehouseId, currentStock: String(stock) }).onConflictDoUpdate({ target: [warehouseStockTable.itemId, warehouseStockTable.locationId], set: { currentStock: String(stock) } });
      const [{ total }] = await tx.select({ total: sql<string>`COALESCE(SUM(CAST(${warehouseStockTable.currentStock} AS DECIMAL)),0)` }).from(warehouseStockTable).where(eq(warehouseStockTable.itemId, id));
      await tx.update(itemsTable).set({ currentStock: total }).where(eq(itemsTable.id, id));
    }
    return updated;
  });
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "update", entityType: "item", entityId: id, clerkUserId: req.auth?.userId });
  if (currentStock !== undefined && row.minThreshold !== null && Number(currentStock) <= Number(row.minThreshold)) {
    sendLowStockAlert(row.name, Number(currentStock), Number(row.minThreshold), row.unit ?? "ед.").catch(() => {});
  }
  res.json(row);
});

router.delete("/items/:id", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db.delete(itemsTable).where(eq(itemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "delete", entityType: "item", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
