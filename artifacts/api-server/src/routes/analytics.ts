import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { itemsTable, categoriesTable, receiptsTable, writeOffsTable, rentalsTable } from "@workspace/db";
import { eq, sql, gte, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/analytics/summary", requireAuth(), async (req: Request, res: Response) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [itemStats] = await db
    .select({
      totalItems: sql<number>`COUNT(*)::int`,
      totalStockValue: sql<number>`COALESCE(SUM(CAST(${itemsTable.currentStock} AS DECIMAL) * CAST(${itemsTable.pricePerUnit} AS DECIMAL)), 0)`,
      lowStockCount: sql<number>`COUNT(CASE WHEN ${itemsTable.minThreshold} IS NOT NULL AND CAST(${itemsTable.currentStock} AS DECIMAL) <= CAST(${itemsTable.minThreshold} AS DECIMAL) THEN 1 END)::int`,
    })
    .from(itemsTable);

  const [receiptStats] = await db
    .select({ total: sql<number>`COALESCE(SUM(CAST(${receiptsTable.totalCost} AS DECIMAL)), 0)` })
    .from(receiptsTable)
    .where(gte(receiptsTable.createdAt, startOfMonth));

  const [receiptLastMonth] = await db
    .select({ total: sql<number>`COALESCE(SUM(CAST(${receiptsTable.totalCost} AS DECIMAL)), 0)` })
    .from(receiptsTable)
    .where(and(gte(receiptsTable.createdAt, startOfLastMonth), sql`${receiptsTable.createdAt} <= ${endOfLastMonth}`));

  const [writeOffStats] = await db
    .select({ total: sql<number>`COALESCE(SUM(CAST(${writeOffsTable.totalValue} AS DECIMAL)), 0)` })
    .from(writeOffsTable)
    .where(gte(writeOffsTable.createdAt, startOfMonth));

  const [writeOffLastMonth] = await db
    .select({ total: sql<number>`COALESCE(SUM(CAST(${writeOffsTable.totalValue} AS DECIMAL)), 0)` })
    .from(writeOffsTable)
    .where(and(gte(writeOffsTable.createdAt, startOfLastMonth), sql`${writeOffsTable.createdAt} <= ${endOfLastMonth}`));

  const receiptsTrend = receiptLastMonth.total > 0
    ? ((receiptStats.total - receiptLastMonth.total) / receiptLastMonth.total) * 100
    : 0;
  const writeOffsTrend = writeOffLastMonth.total > 0
    ? ((writeOffStats.total - writeOffLastMonth.total) / writeOffLastMonth.total) * 100
    : 0;

  res.json({
    totalItems: itemStats.totalItems,
    totalStockValue: Number(itemStats.totalStockValue),
    lowStockCount: itemStats.lowStockCount,
    totalReceiptsThisMonth: Number(receiptStats.total),
    totalWriteOffsThisMonth: Number(writeOffStats.total),
    receiptsTrend: Number(receiptsTrend.toFixed(1)),
    writeOffsTrend: Number(writeOffsTrend.toFixed(1)),
  });
});

router.get("/analytics/category-breakdown", requireAuth(), async (req: Request, res: Response) => {
  const rows = await db
    .select({
      categoryId: itemsTable.categoryId,
      categoryName: categoriesTable.name,
      totalValue: sql<number>`COALESCE(SUM(CAST(${itemsTable.currentStock} AS DECIMAL) * CAST(${itemsTable.pricePerUnit} AS DECIMAL)), 0)`,
      itemCount: sql<number>`COUNT(*)::int`,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .groupBy(itemsTable.categoryId, categoriesTable.name)
    .orderBy(sql`SUM(CAST(${itemsTable.currentStock} AS DECIMAL) * CAST(${itemsTable.pricePerUnit} AS DECIMAL)) DESC`);

  res.json(rows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? "Unknown",
    totalValue: Number(r.totalValue),
    itemCount: r.itemCount,
  })));
});

router.get("/analytics/spending-over-time", requireAuth(), async (req: Request, res: Response) => {
  const period = String(req.query.period ?? "month");
  const trunc = period === "day" ? "day" : period === "week" ? "week" : period === "year" ? "year" : "month";

  const rows = await db.execute(
    sql`SELECT DATE_TRUNC(${trunc}, created_at) AS period,
    COALESCE(SUM(CAST(total_cost AS DECIMAL)), 0) AS receipts,
    0 AS write_offs
    FROM receipts
    GROUP BY period
    UNION ALL
    SELECT DATE_TRUNC(${trunc}, created_at) AS period,
    0 AS receipts,
    COALESCE(SUM(CAST(total_value AS DECIMAL)), 0) AS write_offs
    FROM write_offs
    GROUP BY period
    ORDER BY period ASC`
  );

  const merged: Record<string, { period: string; receipts: number; writeOffs: number }> = {};
  for (const row of rows.rows as Array<{ period: Date | string; receipts: string; write_offs: string }>) {
    const rawPeriod = row.period as unknown;
    const key =
      typeof (rawPeriod as { toISOString?: unknown }).toISOString === "function"
        ? (rawPeriod as Date).toISOString()
        : String(rawPeriod);
    if (!merged[key]) merged[key] = { period: key, receipts: 0, writeOffs: 0 };
    merged[key].receipts += Number(row.receipts);
    merged[key].writeOffs += Number(row.write_offs);
  }

  res.json(Object.values(merged).sort((a, b) => a.period.localeCompare(b.period)));
});

router.get("/analytics/top-write-offs", requireAuth(), async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 50);

  const rows = await db
    .select({
      itemId: writeOffsTable.itemId,
      itemName: itemsTable.name,
      totalQuantity: sql<number>`SUM(CAST(${writeOffsTable.quantity} AS DECIMAL))`,
      totalValue: sql<number>`SUM(CAST(${writeOffsTable.totalValue} AS DECIMAL))`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(writeOffsTable)
    .leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id))
    .groupBy(writeOffsTable.itemId, itemsTable.name)
    .orderBy(sql`SUM(CAST(${writeOffsTable.totalValue} AS DECIMAL)) DESC`)
    .limit(limit);

  res.json(rows.map((r) => ({
    itemId: r.itemId,
    itemName: r.itemName ?? "Unknown",
    totalQuantity: Number(r.totalQuantity),
    totalValue: Number(r.totalValue),
    writeOffCount: r.count,
  })));
});

router.get("/analytics/low-stock", requireAuth(), async (req: Request, res: Response) => {
  const rows = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      categoryName: categoriesTable.name,
      currentStock: itemsTable.currentStock,
      minThreshold: itemsTable.minThreshold,
      unit: itemsTable.unit,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(sql`${itemsTable.minThreshold} IS NOT NULL AND CAST(${itemsTable.currentStock} AS DECIMAL) <= CAST(${itemsTable.minThreshold} AS DECIMAL)`)
    .orderBy(sql`CAST(${itemsTable.currentStock} AS DECIMAL) / NULLIF(CAST(${itemsTable.minThreshold} AS DECIMAL), 0) ASC`);

  res.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryName: r.categoryName ?? "Unknown",
    currentStock: Number(r.currentStock),
    minThreshold: Number(r.minThreshold),
    unit: r.unit,
  })));
});

router.get("/analytics/active-rentals", requireAuth(), async (req: Request, res: Response) => {
  const now = new Date();
  const rows = await db
    .select({
      rentalId: rentalsTable.id,
      itemId: rentalsTable.itemId,
      itemName: itemsTable.name,
      itemUnit: itemsTable.unit,
      quantity: rentalsTable.quantity,
      renterName: rentalsTable.renterName,
      renterPhone: rentalsTable.renterPhone,
      issuedAt: rentalsTable.issuedAt,
      plannedReturnAt: rentalsTable.plannedReturnAt,
    })
    .from(rentalsTable)
    .leftJoin(itemsTable, eq(rentalsTable.itemId, itemsTable.id))
    .where(eq(rentalsTable.status, "active"))
    .orderBy(rentalsTable.plannedReturnAt);

  res.json(rows.map((r) => ({
    ...r,
    itemName: r.itemName ?? "Unknown",
    itemUnit: r.itemUnit ?? "",
    quantity: Number(r.quantity),
    isOverdue: new Date(r.plannedReturnAt) < now,
  })));
});

export default router;
