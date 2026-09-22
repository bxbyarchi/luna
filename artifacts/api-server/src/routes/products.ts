import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, productsTable, housesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireVenueRole } from "../middleware/rbac";
import { getWarehouseScope } from "../lib/warehouseScope";
import { canAccessVenueLocation } from "../lib/venueScope";

const router: IRouter = Router();

router.get("/products", requireAuth(), requireVenueRole("cashier"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const houseId = req.query.houseId ? Number(req.query.houseId) : undefined;
  if (!houseId) { res.status(400).json({ error: "houseId required" }); return; }

  const house = await db.query.housesTable.findFirst({ where: eq(housesTable.id, houseId) });
  if (!house) { res.status(404).json({ error: "Домик не найден" }); return; }
  if (!canAccessVenueLocation(scope, house.locationId)) { res.status(403).json({ error: "Нет доступа к этому домику" }); return; }

  const rows = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.houseId, houseId), eq(productsTable.isActive, true)))
    .orderBy(asc(productsTable.category), asc(productsTable.sortOrder), asc(productsTable.name));
  res.json(rows);
});

router.post("/products", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { houseId, category, name, price, sortOrder } = req.body;
  const hId = Number(houseId);
  if (!hId || !category || !name || price === undefined) { res.status(400).json({ error: "houseId, category, name, price обязательны" }); return; }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) { res.status(400).json({ error: "Некорректная цена" }); return; }

  const house = await db.query.housesTable.findFirst({ where: eq(housesTable.id, hId) });
  if (!house) { res.status(400).json({ error: "Домик не найден" }); return; }
  if (!canAccessVenueLocation(scope, house.locationId)) { res.status(403).json({ error: "Нет доступа к этому домику" }); return; }

  const [row] = await db.insert(productsTable).values({ houseId: hId, category, name, price: String(priceNum), sortOrder: sortOrder ?? 0 }).returning();
  await logAudit({ action: "create", entityType: "product", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.patch("/products/:id", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const product = await db.query.productsTable.findFirst({ where: eq(productsTable.id, id) });
  if (!product) { res.status(404).json({ error: "Not found" }); return; }
  const house = await db.query.housesTable.findFirst({ where: eq(housesTable.id, product.houseId) });
  if (!canAccessVenueLocation(scope, house?.locationId ?? null)) { res.status(403).json({ error: "Нет доступа" }); return; }

  const { category, name, price, isActive, sortOrder } = req.body;
  const updates: Record<string, unknown> = {};
  if (category !== undefined) updates.category = category;
  if (name !== undefined) updates.name = name;
  if (price !== undefined) updates.price = String(Number(price));
  if (isActive !== undefined) updates.isActive = isActive;
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);

  const [row] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  await logAudit({ action: "update", entityType: "product", entityId: id, clerkUserId: req.auth?.userId });
  res.json(row);
});

router.delete("/products/:id", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const product = await db.query.productsTable.findFirst({ where: eq(productsTable.id, id) });
  if (!product) { res.status(404).json({ error: "Not found" }); return; }
  const house = await db.query.housesTable.findFirst({ where: eq(housesTable.id, product.houseId) });
  if (!canAccessVenueLocation(scope, house?.locationId ?? null)) { res.status(403).json({ error: "Нет доступа" }); return; }

  await db.delete(productsTable).where(eq(productsTable.id, id));
  await logAudit({ action: "delete", entityType: "product", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
