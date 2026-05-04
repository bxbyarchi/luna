import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { itemsTable, categoriesTable } from "@workspace/db";
import { eq, sql, and, ilike } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { sendLowStockAlert } from "../lib/telegramBot";

const router: IRouter = Router();

router.get("/items", requireAuth(), async (req: Request, res: Response) => {
  const { categoryId, belowThreshold, search } = req.query;

  const conditions = [];
  if (categoryId) conditions.push(eq(itemsTable.categoryId, Number(categoryId)));
  if (belowThreshold === "true") {
    conditions.push(sql`${itemsTable.currentStock} <= ${itemsTable.minThreshold}`);
  }
  if (search) conditions.push(ilike(itemsTable.name, `%${search}%`));

  const rows = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      categoryId: itemsTable.categoryId,
      categoryName: categoriesTable.name,
      unit: itemsTable.unit,
      location: itemsTable.location,
      currentStock: itemsTable.currentStock,
      minThreshold: itemsTable.minThreshold,
      pricePerUnit: itemsTable.pricePerUnit,
      photoUrl: itemsTable.photoUrl,
      notes: itemsTable.notes,
      isBelowThreshold: sql<boolean>`CASE WHEN ${itemsTable.minThreshold} IS NOT NULL AND CAST(${itemsTable.currentStock} AS DECIMAL) <= CAST(${itemsTable.minThreshold} AS DECIMAL) THEN true ELSE false END`.as("is_below_threshold"),
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(itemsTable.name);

  res.json(rows);
});

router.post("/items", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const { name, categoryId, unit, location, currentStock, minThreshold, pricePerUnit, photoUrl, notes } = req.body;
  if (!name || !categoryId) { res.status(400).json({ error: "name and categoryId required" }); return; }
  const [row] = await db.insert(itemsTable).values({
    name, categoryId: Number(categoryId), unit: unit ?? "шт", location, notes,
    currentStock: String(currentStock ?? 0),
    minThreshold: minThreshold != null ? String(minThreshold) : null,
    pricePerUnit: String(pricePerUnit ?? 0),
    photoUrl,
  }).returning();
  await logAudit({ action: "create", entityType: "item", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.get("/items/:id", requireAuth(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      categoryId: itemsTable.categoryId,
      categoryName: categoriesTable.name,
      unit: itemsTable.unit,
      location: itemsTable.location,
      currentStock: itemsTable.currentStock,
      minThreshold: itemsTable.minThreshold,
      pricePerUnit: itemsTable.pricePerUnit,
      photoUrl: itemsTable.photoUrl,
      notes: itemsTable.notes,
      isBelowThreshold: sql<boolean>`CASE WHEN ${itemsTable.minThreshold} IS NOT NULL AND CAST(${itemsTable.currentStock} AS DECIMAL) <= CAST(${itemsTable.minThreshold} AS DECIMAL) THEN true ELSE false END`,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(eq(itemsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/items/:id", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, categoryId, unit, location, currentStock, minThreshold, pricePerUnit, photoUrl, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (categoryId !== undefined) updates.categoryId = Number(categoryId);
  if (unit !== undefined) updates.unit = unit;
  if (location !== undefined) updates.location = location;
  if (currentStock !== undefined) updates.currentStock = String(currentStock);
  if (minThreshold !== undefined) updates.minThreshold = minThreshold != null ? String(minThreshold) : null;
  if (pricePerUnit !== undefined) updates.pricePerUnit = String(pricePerUnit);
  if (photoUrl !== undefined) updates.photoUrl = photoUrl;
  if (notes !== undefined) updates.notes = notes;

  const [row] = await db.update(itemsTable).set(updates).where(eq(itemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "update", entityType: "item", entityId: id, clerkUserId: req.auth?.userId });
  if (
    currentStock !== undefined &&
    row.minThreshold !== null &&
    Number(row.currentStock) <= Number(row.minThreshold)
  ) {
    sendLowStockAlert(row.name, Number(row.currentStock), Number(row.minThreshold), row.unit ?? "ед.").catch(() => {});
  }
  res.json(row);
});

router.delete("/items/:id", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db.delete(itemsTable).where(eq(itemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await logAudit({ action: "delete", entityType: "item", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
