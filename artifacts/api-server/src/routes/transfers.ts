import { Router, type IRouter, type Request, type Response } from "express";
import { db, transfersTable, warehouseStockTable, locationsTable, itemsTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { getWarehouseScope, canAccessLocation, locationExists } from "../lib/warehouseScope";
import { logAudit } from "../lib/auditLogger";

const router: IRouter = Router();

async function syncItemTotal(tx: any, itemId: number) {
  const [{ total }] = await tx.select({ total: sql<string>`COALESCE(SUM(CAST(${warehouseStockTable.currentStock} AS DECIMAL)),0)` }).from(warehouseStockTable).where(eq(warehouseStockTable.itemId, itemId));
  await tx.update(itemsTable).set({ currentStock: total }).where(eq(itemsTable.id, itemId));
}

router.get("/transfers", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const rows = await db.select({
    id: transfersTable.id, fromLocationId: transfersTable.fromLocationId, fromLocationName: sql<string>`${locationsTable.name}`,
    toLocationId: transfersTable.toLocationId, itemId: transfersTable.itemId, itemName: itemsTable.name, unit: itemsTable.unit,
    quantity: transfersTable.quantity, status: transfersTable.status, note: transfersTable.note,
    createdByClerkId: transfersTable.createdByClerkId, acceptedByClerkId: transfersTable.acceptedByClerkId,
    createdAt: transfersTable.createdAt, acceptedAt: transfersTable.acceptedAt,
  }).from(transfersTable)
    .leftJoin(locationsTable, eq(transfersTable.fromLocationId, locationsTable.id))
    .leftJoin(itemsTable, eq(transfersTable.itemId, itemsTable.id))
    .where(scope.role === "admin" ? undefined : sql`${transfersTable.fromLocationId} = ${scope.locationId} OR ${transfersTable.toLocationId} = ${scope.locationId}`)
    .orderBy(asc(transfersTable.createdAt));
  res.json(rows);
});

router.post("/transfers", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { fromLocationId, toLocationId, itemId, quantity, note } = req.body as { fromLocationId?: number; toLocationId?: number; itemId?: number; quantity?: number; note?: string };
  const fromId = Number(fromLocationId), toId = Number(toLocationId), item = Number(itemId), qty = Number(quantity);
  if (!fromId || !toId || !item || !Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: "Укажите склад отправителя, склад получателя, товар и положительное количество" }); return; }
  if (fromId === toId) { res.status(400).json({ error: "Склад отправителя и получателя должны отличаться" }); return; }
  if (!canAccessLocation(scope, fromId)) { res.status(403).json({ error: "Нет доступа к складу отправителя" }); return; }
  if (!(await locationExists(fromId)) || !(await locationExists(toId))) { res.status(400).json({ error: "Склад не найден или отключён" }); return; }
  try {
    const transfer = await db.transaction(async (tx) => {
      const [stock] = await tx.select().from(warehouseStockTable).where(and(eq(warehouseStockTable.itemId, item), eq(warehouseStockTable.locationId, fromId)));
      const current = Number(stock?.currentStock ?? 0);
      if (current < qty) throw new Error(`Недостаточно товара на складе. Доступно: ${current}`);
      if (stock) await tx.update(warehouseStockTable).set({ currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) - ${qty}` }).where(eq(warehouseStockTable.id, stock.id));
      await syncItemTotal(tx, item);
      const [created] = await tx.insert(transfersTable).values({ fromLocationId: fromId, toLocationId: toId, itemId: item, quantity: String(qty), status: "pending", note: note?.trim() || null, createdByClerkId: scope.userId }).returning();
      return created;
    });
    await logAudit({ action: "create", entityType: "transfer", entityId: transfer.id, clerkUserId: scope.userId, details: `Перемещение ${qty} ед. товара ${item} из ${fromId} в ${toId}` });
    res.status(201).json(transfer);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Не удалось создать перемещение" }); }
});

router.post("/transfers/:id/accept", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  try {
    const transfer = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(transfersTable).where(eq(transfersTable.id, id));
      if (!row) throw new Error("Перемещение не найдено");
      if (row.status !== "pending") throw new Error("Перемещение уже обработано");
      if (!canAccessLocation(scope, row.toLocationId)) throw new Error("Нет доступа к складу получателя");
      const [stock] = await tx.select().from(warehouseStockTable).where(and(eq(warehouseStockTable.itemId, row.itemId), eq(warehouseStockTable.locationId, row.toLocationId)));
      if (stock) await tx.update(warehouseStockTable).set({ currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) + ${row.quantity}` }).where(eq(warehouseStockTable.id, stock.id));
      else await tx.insert(warehouseStockTable).values({ itemId: row.itemId, locationId: row.toLocationId, currentStock: row.quantity });
      await syncItemTotal(tx, row.itemId);
      const [updated] = await tx.update(transfersTable).set({ status: "accepted", acceptedByClerkId: scope.userId, acceptedAt: new Date() }).where(and(eq(transfersTable.id, id), eq(transfersTable.status, "pending"))).returning();
      if (!updated) throw new Error("Перемещение уже обработано");
      return updated;
    });
    await logAudit({ action: "accept", entityType: "transfer", entityId: id, clerkUserId: scope.userId, details: `Принято ${transfer.quantity} ед.` });
    res.json(transfer);
  } catch (error) { const message = error instanceof Error ? error.message : "Не удалось принять перемещение"; res.status(message === "Перемещение не найдено" ? 404 : 400).json({ error: message }); }
});

router.post("/transfers/:id/reject", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  try {
    const transfer = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(transfersTable).where(eq(transfersTable.id, id));
      if (!row) throw new Error("Перемещение не найдено");
      if (row.status !== "pending") throw new Error("Перемещение уже обработано");
      if (!canAccessLocation(scope, row.toLocationId)) throw new Error("Нет доступа к складу получателя");
      const [sourceStock] = await tx.select().from(warehouseStockTable).where(and(eq(warehouseStockTable.itemId, row.itemId), eq(warehouseStockTable.locationId, row.fromLocationId)));
      if (sourceStock) await tx.update(warehouseStockTable).set({ currentStock: sql`CAST(${warehouseStockTable.currentStock} AS DECIMAL) + ${row.quantity}` }).where(eq(warehouseStockTable.id, sourceStock.id));
      else await tx.insert(warehouseStockTable).values({ itemId: row.itemId, locationId: row.fromLocationId, currentStock: row.quantity });
      await syncItemTotal(tx, row.itemId);
      const [updated] = await tx.update(transfersTable).set({ status: "rejected", acceptedByClerkId: scope.userId, acceptedAt: new Date() }).where(and(eq(transfersTable.id, id), eq(transfersTable.status, "pending"))).returning();
      if (!updated) throw new Error("Перемещение уже обработано");
      return updated;
    });
    await logAudit({ action: "reject", entityType: "transfer", entityId: id, clerkUserId: scope.userId });
    res.json(transfer);
  } catch (error) { const message = error instanceof Error ? error.message : "Не удалось отклонить перемещение"; res.status(message === "Перемещение не найдено" ? 404 : 400).json({ error: message }); }
});

export default router;
