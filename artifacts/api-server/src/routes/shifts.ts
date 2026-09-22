import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, shiftsTable, registersTable, housesTable, locationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { getWarehouseScope, canAccessLocation } from "../lib/warehouseScope";
import { getRegisterLocationId } from "../lib/venueScope";

const router: IRouter = Router();

router.get("/shifts", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const requestedLocation = scope.role === "admin" && req.query.locationId ? Number(req.query.locationId) : scope.locationId;

  const conditions = [];
  if (requestedLocation) conditions.push(eq(housesTable.locationId, requestedLocation));
  if (req.query.registerId) conditions.push(eq(shiftsTable.registerId, Number(req.query.registerId)));
  if (req.query.status) conditions.push(eq(shiftsTable.status, String(req.query.status)));

  const rows = await db
    .select({
      id: shiftsTable.id,
      registerId: shiftsTable.registerId,
      registerName: registersTable.name,
      houseName: housesTable.name,
      locationId: housesTable.locationId,
      locationName: locationsTable.name,
      cashierName: shiftsTable.cashierName,
      status: shiftsTable.status,
      openingCash: shiftsTable.openingCash,
      closingCashCounted: shiftsTable.closingCashCounted,
      expectedCash: shiftsTable.expectedCash,
      cashDifference: shiftsTable.cashDifference,
      totalSalesCash: shiftsTable.totalSalesCash,
      totalSalesCard: shiftsTable.totalSalesCard,
      totalReturns: shiftsTable.totalReturns,
      notes: shiftsTable.notes,
      openedAt: shiftsTable.openedAt,
      closedAt: shiftsTable.closedAt,
    })
    .from(shiftsTable)
    .innerJoin(registersTable, eq(shiftsTable.registerId, registersTable.id))
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .leftJoin(locationsTable, eq(housesTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${shiftsTable.openedAt} DESC`);
  res.json(rows);
});

router.get("/shifts/:id", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const [row] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const locationId = await getRegisterLocationId(row.registerId);
  if (!canAccessLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа к этой смене" }); return; }
  res.json(row);
});

router.post("/shifts", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { registerId, cashierName, openingCash } = req.body;
  const regId = Number(registerId);
  if (!regId || !cashierName) { res.status(400).json({ error: "registerId и cashierName обязательны" }); return; }

  const locationId = await getRegisterLocationId(regId);
  if (!canAccessLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа к этой кассе" }); return; }

  const existingOpen = await db.query.shiftsTable.findFirst({ where: and(eq(shiftsTable.registerId, regId), eq(shiftsTable.status, "open")) });
  if (existingOpen) { res.status(409).json({ error: "На этой кассе уже есть открытая смена" }); return; }

  const [row] = await db.insert(shiftsTable).values({
    registerId: regId,
    cashierName,
    openingCash: String(Number(openingCash) || 0),
    openedByClerkId: req.auth?.userId,
  }).returning();
  await logAudit({ action: "open_shift", entityType: "shift", entityId: row.id, clerkUserId: req.auth?.userId, details: `Касса ${regId}, кассир ${cashierName}` });
  res.status(201).json(row);
});

router.patch("/shifts/:id/close", requireAuth(), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const id = Number(req.params.id);
  const { closingCashCounted, notes } = req.body;
  if (closingCashCounted === undefined || closingCashCounted === null) { res.status(400).json({ error: "closingCashCounted обязателен" }); return; }

  const shift = await db.query.shiftsTable.findFirst({ where: eq(shiftsTable.id, id) });
  if (!shift) { res.status(404).json({ error: "Not found" }); return; }
  const locationId = await getRegisterLocationId(shift.registerId);
  if (!canAccessLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа к этой смене" }); return; }
  if (shift.status !== "open") { res.status(409).json({ error: "Смена уже закрыта" }); return; }

  const expectedCash = Number(shift.openingCash) + Number(shift.totalSalesCash) - Number(shift.totalReturns);
  const counted = Number(closingCashCounted);
  const cashDifference = counted - expectedCash;

  const [row] = await db.update(shiftsTable).set({
    status: "closed",
    closingCashCounted: String(counted),
    expectedCash: String(expectedCash),
    cashDifference: String(cashDifference),
    notes: notes ?? shift.notes,
    closedByClerkId: req.auth?.userId,
    closedAt: new Date(),
  }).where(eq(shiftsTable.id, id)).returning();

  await logAudit({ action: "close_shift", entityType: "shift", entityId: id, clerkUserId: req.auth?.userId, details: `Расхождение: ${cashDifference} сом` });
  res.json(row);
});

export default router;
