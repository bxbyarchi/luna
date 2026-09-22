import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, salesTable, saleItemsTable, shiftsTable, registersTable, housesTable, locationsTable } from "@workspace/db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getWarehouseScope } from "../lib/warehouseScope";
import { isVenueAdmin } from "../lib/venueScope";
import { requireVenueRole } from "../middleware/rbac";

const router: IRouter = Router();

function parseRange(req: Request): { from?: Date; to?: Date } {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to) + "T23:59:59") : undefined;
  return { from, to };
}

async function resolveLocationId(req: Request): Promise<number | null | undefined> {
  const scope = await getWarehouseScope(req);
  if (!scope) return undefined;
  return isVenueAdmin(scope.role) && req.query.locationId ? Number(req.query.locationId) : scope.locationId;
}

router.get("/kassa-analytics/summary", requireAuth(), requireVenueRole("location_admin"), async (req: Request, res: Response) => {
  const locationId = await resolveLocationId(req);
  if (locationId === undefined) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const { from, to } = parseRange(req);

  const conditions = [];
  if (locationId) conditions.push(eq(housesTable.locationId, locationId));
  if (from) conditions.push(gte(salesTable.createdAt, from));
  if (to) conditions.push(lte(salesTable.createdAt, to));

  const [salesStats] = await db
    .select({
      totalCash: sql<number>`COALESCE(SUM(CASE WHEN ${salesTable.paymentMethod} = 'cash' THEN CAST(${salesTable.totalAmount} AS DECIMAL) ELSE 0 END), 0)`,
      totalCard: sql<number>`COALESCE(SUM(CASE WHEN ${salesTable.paymentMethod} = 'card' THEN CAST(${salesTable.totalAmount} AS DECIMAL) ELSE 0 END), 0)`,
      salesCount: sql<number>`COUNT(*)::int`,
    })
    .from(salesTable)
    .innerJoin(registersTable, eq(salesTable.registerId, registersTable.id))
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .where(conditions.length ? and(...conditions) : undefined);

  const shiftConditions = [];
  if (locationId) shiftConditions.push(eq(housesTable.locationId, locationId));
  const [shiftStats] = await db
    .select({
      openCount: sql<number>`COUNT(CASE WHEN ${shiftsTable.status} = 'open' THEN 1 END)::int`,
      totalReturns: sql<number>`COALESCE(SUM(CAST(${shiftsTable.totalReturns} AS DECIMAL)), 0)`,
    })
    .from(shiftsTable)
    .innerJoin(registersTable, eq(shiftsTable.registerId, registersTable.id))
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .where(shiftConditions.length ? and(...shiftConditions) : undefined);

  const byVenue = await db
    .select({
      locationId: housesTable.locationId,
      locationName: locationsTable.name,
      totalSales: sql<number>`COALESCE(SUM(CAST(${salesTable.totalAmount} AS DECIMAL)), 0)`,
      salesCount: sql<number>`COUNT(${salesTable.id})::int`,
    })
    .from(salesTable)
    .innerJoin(registersTable, eq(salesTable.registerId, registersTable.id))
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .leftJoin(locationsTable, eq(housesTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(housesTable.locationId, locationsTable.name)
    .orderBy(sql`SUM(CAST(${salesTable.totalAmount} AS DECIMAL)) DESC`);

  const byHouse = await db
    .select({
      houseId: housesTable.id,
      houseName: housesTable.name,
      locationName: locationsTable.name,
      totalSales: sql<number>`COALESCE(SUM(CAST(${salesTable.totalAmount} AS DECIMAL)), 0)`,
      salesCount: sql<number>`COUNT(${salesTable.id})::int`,
    })
    .from(salesTable)
    .innerJoin(registersTable, eq(salesTable.registerId, registersTable.id))
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .leftJoin(locationsTable, eq(housesTable.locationId, locationsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(housesTable.id, housesTable.name, locationsTable.name)
    .orderBy(sql`SUM(CAST(${salesTable.totalAmount} AS DECIMAL)) DESC`);

  const itemConditions = [];
  if (locationId) itemConditions.push(eq(housesTable.locationId, locationId));
  if (from) itemConditions.push(gte(salesTable.createdAt, from));
  if (to) itemConditions.push(lte(salesTable.createdAt, to));
  const topItems = await db
    .select({
      name: saleItemsTable.name,
      totalQuantity: sql<number>`SUM(CAST(${saleItemsTable.quantity} AS DECIMAL) - CAST(${saleItemsTable.returnedQuantity} AS DECIMAL))`,
      totalRevenue: sql<number>`SUM((CAST(${saleItemsTable.quantity} AS DECIMAL) - CAST(${saleItemsTable.returnedQuantity} AS DECIMAL)) * CAST(${saleItemsTable.pricePerUnit} AS DECIMAL))`,
    })
    .from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .innerJoin(registersTable, eq(salesTable.registerId, registersTable.id))
    .innerJoin(housesTable, eq(registersTable.houseId, housesTable.id))
    .where(itemConditions.length ? and(...itemConditions) : undefined)
    .groupBy(saleItemsTable.name)
    .orderBy(sql`SUM((CAST(${saleItemsTable.quantity} AS DECIMAL) - CAST(${saleItemsTable.returnedQuantity} AS DECIMAL)) * CAST(${saleItemsTable.pricePerUnit} AS DECIMAL)) DESC`)
    .limit(10);

  const totalSales = Number(salesStats.totalCash) + Number(salesStats.totalCard);
  const totalReturns = Number(shiftStats.totalReturns);

  res.json({
    totalSalesCash: Number(salesStats.totalCash),
    totalSalesCard: Number(salesStats.totalCard),
    totalSales,
    totalReturns,
    netRevenue: totalSales - totalReturns,
    salesCount: salesStats.salesCount,
    openShiftsCount: shiftStats.openCount,
    byVenue: byVenue.map((v) => ({ locationId: v.locationId, locationName: v.locationName ?? "—", totalSales: Number(v.totalSales), salesCount: v.salesCount })),
    byHouse: byHouse.map((h) => ({ houseId: h.houseId, houseName: h.houseName, locationName: h.locationName ?? "—", totalSales: Number(h.totalSales), salesCount: h.salesCount })),
    topItems: topItems.map((i) => ({ name: i.name, totalQuantity: Number(i.totalQuantity), totalRevenue: Number(i.totalRevenue) })),
  });
});

export default router;
