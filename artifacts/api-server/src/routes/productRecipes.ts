import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, productRecipeItemsTable, productsTable, housesTable, itemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireVenueRole } from "../middleware/rbac";
import { getWarehouseScope } from "../lib/warehouseScope";
import { canAccessVenueLocation } from "../lib/venueScope";

const router: IRouter = Router();

async function loadProductWithAccess(req: Request, res: Response, productId: number) {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return null; }
  const product = await db.query.productsTable.findFirst({ where: eq(productsTable.id, productId) });
  if (!product) { res.status(404).json({ error: "Товар не найден" }); return null; }
  const house = await db.query.housesTable.findFirst({ where: eq(housesTable.id, product.houseId) });
  if (!canAccessVenueLocation(scope, house?.locationId ?? null)) { res.status(403).json({ error: "Нет доступа" }); return null; }
  return { scope, product };
}

router.get("/products/:id/cost", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const productId = Number(req.params.id);
  const loaded = await loadProductWithAccess(req, res, productId);
  if (!loaded) return;
  const { product } = loaded;

  const rows = await db
    .select({
      id: productRecipeItemsTable.id,
      itemId: productRecipeItemsTable.itemId,
      itemName: itemsTable.name,
      unit: itemsTable.unit,
      quantity: productRecipeItemsTable.quantity,
      pricePerUnit: itemsTable.pricePerUnit,
    })
    .from(productRecipeItemsTable)
    .innerJoin(itemsTable, eq(productRecipeItemsTable.itemId, itemsTable.id))
    .where(eq(productRecipeItemsTable.productId, productId))
    .orderBy(itemsTable.name);

  const ingredients = rows.map((r) => ({ ...r, cost: Number(r.quantity) * Number(r.pricePerUnit) }));
  const totalCost = ingredients.reduce((sum, r) => sum + r.cost, 0);
  const price = Number(product.price);
  const margin = price - totalCost;
  const marginPercent = price > 0 ? (margin / price) * 100 : 0;

  res.json({ productId, price, totalCost, margin, marginPercent, ingredients });
});

router.post("/products/:id/recipe", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const productId = Number(req.params.id);
  const loaded = await loadProductWithAccess(req, res, productId);
  if (!loaded) return;

  const { itemId, quantity } = req.body as { itemId?: number; quantity?: number };
  const qty = Number(quantity);
  if (!itemId || !Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: "itemId и quantity (> 0) обязательны" }); return; }
  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, Number(itemId)) });
  if (!item) { res.status(400).json({ error: "Складская позиция не найдена" }); return; }

  const duplicate = await db.query.productRecipeItemsTable.findFirst({
    where: and(eq(productRecipeItemsTable.productId, productId), eq(productRecipeItemsTable.itemId, Number(itemId))),
  });
  if (duplicate) { res.status(409).json({ error: "Этот компонент уже добавлен в состав" }); return; }

  const [row] = await db.insert(productRecipeItemsTable).values({ productId, itemId: Number(itemId), quantity: String(qty) }).returning();
  await logAudit({ action: "create", entityType: "product_recipe_item", entityId: row.id, clerkUserId: req.auth?.userId, details: `${item.name} × ${qty} ${item.unit}` });
  res.status(201).json(row);
});

router.patch("/products/recipe/:id", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const recipeItem = await db.query.productRecipeItemsTable.findFirst({ where: eq(productRecipeItemsTable.id, id) });
  if (!recipeItem) { res.status(404).json({ error: "Not found" }); return; }
  const loaded = await loadProductWithAccess(req, res, recipeItem.productId);
  if (!loaded) return;

  const { quantity } = req.body as { quantity?: number };
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: "Некорректное количество" }); return; }

  const [row] = await db.update(productRecipeItemsTable).set({ quantity: String(qty) }).where(eq(productRecipeItemsTable.id, id)).returning();
  await logAudit({ action: "update", entityType: "product_recipe_item", entityId: id, clerkUserId: req.auth?.userId });
  res.json(row);
});

router.delete("/products/recipe/:id", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const recipeItem = await db.query.productRecipeItemsTable.findFirst({ where: eq(productRecipeItemsTable.id, id) });
  if (!recipeItem) { res.status(404).json({ error: "Not found" }); return; }
  const loaded = await loadProductWithAccess(req, res, recipeItem.productId);
  if (!loaded) return;

  await db.delete(productRecipeItemsTable).where(eq(productRecipeItemsTable.id, id));
  await logAudit({ action: "delete", entityType: "product_recipe_item", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).end();
});

export default router;
