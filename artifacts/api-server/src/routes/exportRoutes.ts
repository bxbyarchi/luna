import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { itemsTable, categoriesTable, writeOffsTable, staffTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

router.get("/export/stock", requireAuth(), requireRole("admin", "manager", "accountant"), async (req: Request, res: Response) => {
  const rows = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      category: categoriesTable.name,
      unit: itemsTable.unit,
      location: itemsTable.location,
      currentStock: itemsTable.currentStock,
      minThreshold: itemsTable.minThreshold,
      pricePerUnit: itemsTable.pricePerUnit,
      totalValue: sql<string>`CAST(${itemsTable.currentStock} AS DECIMAL) * CAST(${itemsTable.pricePerUnit} AS DECIMAL)`,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .orderBy(categoriesTable.name, itemsTable.name);

  const data = rows.map((r) => ({
    "ID": r.id,
    "Наименование": r.name,
    "Категория": r.category ?? "",
    "Ед. изм.": r.unit,
    "Расположение": r.location ?? "",
    "Остаток": Number(r.currentStock),
    "Мин. остаток": r.minThreshold ? Number(r.minThreshold) : "",
    "Цена за ед.": Number(r.pricePerUnit),
    "Общая стоимость": Number(r.totalValue),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Остатки");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

router.get("/export/write-offs", requireAuth(), requireRole("admin", "manager", "accountant"), async (req: Request, res: Response) => {
  const { from, to } = req.query;
  const conditions = [];
  if (from) conditions.push(sql`${writeOffsTable.createdAt} >= ${new Date(String(from))}`);
  if (to) conditions.push(sql`${writeOffsTable.createdAt} <= ${new Date(String(to))}`);

  const rows = await db
    .select({
      id: writeOffsTable.id,
      itemName: itemsTable.name,
      quantity: writeOffsTable.quantity,
      reason: writeOffsTable.reason,
      staffName: staffTable.name,
      totalValue: writeOffsTable.totalValue,
      createdAt: writeOffsTable.createdAt,
    })
    .from(writeOffsTable)
    .leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id))
    .leftJoin(staffTable, eq(writeOffsTable.staffId, staffTable.id))
    .orderBy(sql`${writeOffsTable.createdAt} DESC`);

  const data = rows.map((r) => ({
    "ID": r.id,
    "Позиция": r.itemName ?? "",
    "Количество": Number(r.quantity),
    "Причина": r.reason,
    "Сотрудник": r.staffName ?? "",
    "Сумма списания": Number(r.totalValue),
    "Дата": r.createdAt?.toISOString().slice(0, 10) ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Списания");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="write-offs-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

export default router;
