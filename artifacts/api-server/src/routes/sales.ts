import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, salesTable, saleItemsTable, shiftsTable, registersTable, housesTable, locationsTable, returnsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { getWarehouseScope, canAccessLocation } from "../lib/warehouseScope";
import { getRegisterLocationId } from "../lib/venueScope";

const router: IRouter = Router();

type SaleItemInput = { name: string; quantity: number; pricePerUnit: number };

router.get("/sales", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const requestedLocation = scope.role === "admin" && req.query.locationId ? Number(req.query.locationId) : scope.locationId;

  const conditions = [];
  if (requestedLocation) conditions.push(eq(housesTable.locationId, requestedLocation));
  if (req.query.shiftId) conditions.push(eq(salesTable.shiftId, Number(req.query.shiftId)));
  if (req.query.registerId) conditions.push(eq(salesTable.registerId, Number(req.query.registerId)));

  const rows = await db
    .select({
      id: salesTable.id,
      shiftId: salesTable.shiftId,
      registerId: salesTable.registerId,
      registerName: registersTable.name,
      houseName: housesTable.name,
      locationName: locationsTable.name,
      totalAmount: salesTable.totalAmount,
      paymentMethod: salesTable.paymentMethod,
      status: salesTable.status,
      createdAt: salesTable.createdAt,
    })
    .from(salesTable)
    .innerJoin(registersTable, eq(salesTable.registerId, registersTable.id))
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .leftJoin(locationsTable, eq(housesTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${salesTable.createdAt} DESC`)
    .limit(200);
  res.json(rows);
});

router.get("/sales/:id", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const sale = await db.query.salesTable.findFirst({ where: eq(salesTable.id, id) });
  if (!sale) { res.status(404).json({ error: "Not found" }); return; }
  const locationId = await getRegisterLocationId(sale.registerId);
  if (!canAccessLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа" }); return; }
  const items = await db.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, id));
  res.json({ ...sale, items });
});

router.post("/sales", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { shiftId, items, paymentMethod } = req.body as { shiftId: number; items: SaleItemInput[]; paymentMethod?: "cash" | "card" };
  if (!shiftId || !Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "shiftId и items обязательны" }); return; }
  for (const it of items) {
    if (!it.name || !(Number(it.quantity) > 0) || !(Number(it.pricePerUnit) >= 0)) { res.status(400).json({ error: "Некорректная позиция продажи" }); return; }
  }

  const shift = await db.query.shiftsTable.findFirst({ where: eq(shiftsTable.id, Number(shiftId)) });
  if (!shift) { res.status(404).json({ error: "Смена не найдена" }); return; }
  if (shift.status !== "open") { res.status(409).json({ error: "Смена закрыта" }); return; }
  const locationId = await getRegisterLocationId(shift.registerId);
  if (!canAccessLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа к этой смене" }); return; }

  const method = paymentMethod === "card" ? "card" : "cash";
  const totalAmount = items.reduce((sum, it) => sum + Number(it.quantity) * Number(it.pricePerUnit), 0);

  const sale = await db.transaction(async (tx) => {
    const [createdSale] = await tx.insert(salesTable).values({
      shiftId: shift.id,
      registerId: shift.registerId,
      totalAmount: String(totalAmount),
      paymentMethod: method,
      createdByClerkId: req.auth?.userId,
    }).returning();

    await tx.insert(saleItemsTable).values(items.map((it) => ({
      saleId: createdSale.id,
      name: it.name,
      quantity: String(it.quantity),
      pricePerUnit: String(it.pricePerUnit),
      totalPrice: String(Number(it.quantity) * Number(it.pricePerUnit)),
    })));

    const cashDelta = method === "cash" ? totalAmount : 0;
    const cardDelta = method === "card" ? totalAmount : 0;
    await tx.update(shiftsTable).set({
      totalSalesCash: sql`${shiftsTable.totalSalesCash} + ${cashDelta}`,
      totalSalesCard: sql`${shiftsTable.totalSalesCard} + ${cardDelta}`,
    }).where(eq(shiftsTable.id, shift.id));

    return createdSale;
  });

  await logAudit({ action: "create", entityType: "sale", entityId: sale.id, clerkUserId: req.auth?.userId, details: `${totalAmount} сом, ${method}` });
  res.status(201).json(sale);
});

router.post("/sales/:id/returns", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const saleId = Number(req.params.id);
  const { items, reason } = req.body as { items: Array<{ saleItemId: number; quantity: number }>; reason?: string };
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "items обязателен" }); return; }

  const sale = await db.query.salesTable.findFirst({ where: eq(salesTable.id, saleId) });
  if (!sale) { res.status(404).json({ error: "Продажа не найдена" }); return; }
  const locationId = await getRegisterLocationId(sale.registerId);
  if (!canAccessLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа" }); return; }

  let result: { totalReturnAmount: number; status: string };
  try {
    result = await db.transaction(async (tx) => {
      let totalReturnAmount = 0;
      for (const it of items) {
        const [saleItem] = await tx.select().from(saleItemsTable).where(and(eq(saleItemsTable.id, it.saleItemId), eq(saleItemsTable.saleId, saleId)));
        if (!saleItem) throw new Error(`Позиция ${it.saleItemId} не найдена в этой продаже`);
        const available = Number(saleItem.quantity) - Number(saleItem.returnedQuantity);
        const qty = Number(it.quantity);
        if (!(qty > 0) || qty > available) throw new Error(`Некорректное количество для возврата по позиции «${saleItem.name}»`);
        const amount = qty * Number(saleItem.pricePerUnit);
        totalReturnAmount += amount;

        await tx.insert(returnsTable).values({
          saleItemId: saleItem.id,
          quantity: String(qty),
          amount: String(amount),
          reason: reason ?? "Возврат",
          createdByClerkId: req.auth?.userId,
        });
        await tx.update(saleItemsTable).set({ returnedQuantity: sql`${saleItemsTable.returnedQuantity} + ${qty}` }).where(eq(saleItemsTable.id, saleItem.id));
      }

      const allItems = await tx.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, saleId));
      const fullyReturned = allItems.every((i) => Number(i.returnedQuantity) >= Number(i.quantity));
      const anyReturned = allItems.some((i) => Number(i.returnedQuantity) > 0);
      const newStatus = fullyReturned ? "returned" : anyReturned ? "partially_returned" : "completed";
      await tx.update(salesTable).set({ status: newStatus }).where(eq(salesTable.id, saleId));
      await tx.update(shiftsTable).set({ totalReturns: sql`${shiftsTable.totalReturns} + ${totalReturnAmount}` }).where(eq(shiftsTable.id, sale.shiftId));

      return { totalReturnAmount, status: newStatus };
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Ошибка возврата" });
    return;
  }

  await logAudit({ action: "return", entityType: "sale", entityId: saleId, clerkUserId: req.auth?.userId, details: `${result.totalReturnAmount} сом` });
  res.json(result);
});

export default router;
