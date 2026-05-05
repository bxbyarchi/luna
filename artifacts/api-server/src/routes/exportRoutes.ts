import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import {
  itemsTable,
  categoriesTable,
  writeOffsTable,
  staffTable,
  receiptsTable,
  rentalsTable,
} from "@workspace/db";
import { eq, sql, and, gte, lte, or } from "drizzle-orm";
import * as XLSX from "xlsx";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

function fmt(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU");
}

router.get("/export/stock", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
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
    "Цена за ед. (сом)": Number(r.pricePerUnit),
    "Общая стоимость (сом)": Number(r.totalValue),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Остатки");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

router.get("/export/write-offs", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { from, to } = req.query;
  const conditions = [];
  if (from) conditions.push(gte(writeOffsTable.createdAt, new Date(String(from))));
  if (to) conditions.push(lte(writeOffsTable.createdAt, new Date(String(to))));

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
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${writeOffsTable.createdAt} DESC`);

  const data = rows.map((r) => ({
    "ID": r.id,
    "Позиция": r.itemName ?? "",
    "Количество": Number(r.quantity),
    "Причина": r.reason,
    "Сотрудник": r.staffName ?? "",
    "Сумма списания (сом)": Number(r.totalValue),
    "Дата": fmt(r.createdAt),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Списания");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="write-offs-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

router.get("/reports/full", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { from, to, format } = req.query;
  const fromDate = from ? new Date(String(from)) : undefined;
  const toDate = to ? new Date(String(to) + "T23:59:59") : undefined;

  const stockRows = await db
    .select({
      name: itemsTable.name,
      category: categoriesTable.name,
      unit: itemsTable.unit,
      currentStock: itemsTable.currentStock,
      pricePerUnit: itemsTable.pricePerUnit,
      totalValue: sql<string>`CAST(${itemsTable.currentStock} AS DECIMAL) * CAST(${itemsTable.pricePerUnit} AS DECIMAL)`,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .orderBy(categoriesTable.name, itemsTable.name);

  const receiptConditions: ReturnType<typeof gte>[] = [];
  if (fromDate) receiptConditions.push(gte(receiptsTable.createdAt, fromDate));
  if (toDate) receiptConditions.push(lte(receiptsTable.createdAt, toDate));

  const receiptRows = await db
    .select({
      itemName: itemsTable.name,
      unit: itemsTable.unit,
      quantity: receiptsTable.quantity,
      pricePerUnit: receiptsTable.pricePerUnit,
      totalCost: receiptsTable.totalCost,
      supplier: receiptsTable.supplier,
      createdAt: receiptsTable.createdAt,
    })
    .from(receiptsTable)
    .leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id))
    .where(receiptConditions.length ? and(...receiptConditions) : undefined)
    .orderBy(sql`${receiptsTable.createdAt} ASC`);

  const woConditions: ReturnType<typeof gte>[] = [];
  if (fromDate) woConditions.push(gte(writeOffsTable.createdAt, fromDate));
  if (toDate) woConditions.push(lte(writeOffsTable.createdAt, toDate));

  const writeOffRows = await db
    .select({
      itemName: itemsTable.name,
      unit: itemsTable.unit,
      quantity: writeOffsTable.quantity,
      totalValue: writeOffsTable.totalValue,
      reason: writeOffsTable.reason,
      staffName: staffTable.name,
      createdAt: writeOffsTable.createdAt,
    })
    .from(writeOffsTable)
    .leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id))
    .leftJoin(staffTable, eq(writeOffsTable.staffId, staffTable.id))
    .where(woConditions.length ? and(...woConditions) : undefined)
    .orderBy(sql`${writeOffsTable.createdAt} ASC`);

  const rentalConditions = [];
  if (fromDate && toDate) {
    rentalConditions.push(
      or(
        and(gte(rentalsTable.issuedAt, fromDate), lte(rentalsTable.issuedAt, toDate)),
        and(gte(rentalsTable.returnedAt, fromDate), lte(rentalsTable.returnedAt, toDate)),
        eq(rentalsTable.status, "active"),
      )!
    );
  }

  const rentalRows = await db
    .select({
      itemName: itemsTable.name,
      itemUnit: itemsTable.unit,
      quantity: rentalsTable.quantity,
      renterName: rentalsTable.renterName,
      renterPhone: rentalsTable.renterPhone,
      issuedAt: rentalsTable.issuedAt,
      plannedReturnAt: rentalsTable.plannedReturnAt,
      status: rentalsTable.status,
      returnedAt: rentalsTable.returnedAt,
    })
    .from(rentalsTable)
    .leftJoin(itemsTable, eq(rentalsTable.itemId, itemsTable.id))
    .where(rentalConditions.length ? and(...rentalConditions) : undefined)
    .orderBy(sql`${rentalsTable.issuedAt} ASC`);

  const totalStockValue = stockRows.reduce((s, r) => s + Number(r.totalValue), 0);
  const totalReceipts = receiptRows.reduce((s, r) => s + Number(r.totalCost), 0);
  const totalWriteOffs = writeOffRows.reduce((s, r) => s + Number(r.totalValue), 0);
  const activeRentals = rentalRows.filter((r) => r.status === "active").length;

  if (format === "json") {
    res.json({
      period: { from: from ?? null, to: to ?? null },
      stock: stockRows.map((r) => ({
        name: r.name,
        category: r.category ?? "—",
        unit: r.unit,
        currentStock: Number(r.currentStock),
        pricePerUnit: Number(r.pricePerUnit),
        totalValue: Number(r.totalValue),
      })),
      receipts: receiptRows.map((r) => ({
        date: fmt(r.createdAt),
        itemName: r.itemName ?? "—",
        unit: r.unit ?? "",
        quantity: Number(r.quantity),
        pricePerUnit: Number(r.pricePerUnit),
        totalCost: Number(r.totalCost),
        supplier: r.supplier ?? "—",
      })),
      writeOffs: writeOffRows.map((r) => ({
        date: fmt(r.createdAt),
        itemName: r.itemName ?? "—",
        unit: r.unit ?? "",
        quantity: Number(r.quantity),
        totalValue: Number(r.totalValue),
        reason: r.reason ?? "—",
        staffName: r.staffName ?? "—",
      })),
      rentals: rentalRows.map((r) => ({
        itemName: r.itemName ?? "—",
        unit: r.itemUnit ?? "",
        quantity: Number(r.quantity),
        renterName: r.renterName,
        renterPhone: r.renterPhone ?? "—",
        issuedAt: fmt(r.issuedAt),
        plannedReturnAt: fmt(r.plannedReturnAt),
        returnedAt: fmt(r.returnedAt),
        status: r.status === "active" ? "Активна" : "Возвращена",
      })),
      summary: {
        totalStockValue,
        totalReceipts,
        totalWriteOffs,
        activeRentals,
      },
    });
    return;
  }

  const wb = XLSX.utils.book_new();

  const stockData = stockRows.map((r) => ({
    "Наименование": r.name,
    "Категория": r.category ?? "—",
    "Ед. изм.": r.unit,
    "Остаток": Number(r.currentStock),
    "Цена за ед. (сом)": Number(r.pricePerUnit),
    "Сумма (сом)": Number(r.totalValue),
  }));
  const stockSheet = XLSX.utils.json_to_sheet(stockData);
  stockSheet["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, stockSheet, "Остатки");

  const receiptData = receiptRows.map((r) => ({
    "Дата": fmt(r.createdAt),
    "Позиция": r.itemName ?? "—",
    "Ед. изм.": r.unit ?? "",
    "Количество": Number(r.quantity),
    "Цена за ед. (сом)": Number(r.pricePerUnit),
    "Сумма (сом)": Number(r.totalCost),
    "Поставщик": r.supplier ?? "—",
  }));
  const receiptSheet = XLSX.utils.json_to_sheet(receiptData.length ? receiptData : [{ "Нет данных за период": "" }]);
  receiptSheet["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, receiptSheet, "Поступления");

  const writeOffData = writeOffRows.map((r) => ({
    "Дата": fmt(r.createdAt),
    "Позиция": r.itemName ?? "—",
    "Ед. изм.": r.unit ?? "",
    "Количество": Number(r.quantity),
    "Сумма (сом)": Number(r.totalValue),
    "Причина": r.reason ?? "—",
    "Сотрудник": r.staffName ?? "—",
  }));
  const writeOffSheet = XLSX.utils.json_to_sheet(writeOffData.length ? writeOffData : [{ "Нет данных за период": "" }]);
  writeOffSheet["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, writeOffSheet, "Списания");

  const rentalData = rentalRows.map((r) => ({
    "Позиция": r.itemName ?? "—",
    "Ед. изм.": r.itemUnit ?? "",
    "Количество": Number(r.quantity),
    "Арендатор": r.renterName,
    "Телефон": r.renterPhone ?? "—",
    "Выдано": fmt(r.issuedAt),
    "Возврат (план)": fmt(r.plannedReturnAt),
    "Возвращено": fmt(r.returnedAt),
    "Статус": r.status === "active" ? "Активна" : "Возвращена",
  }));
  const rentalSheet = XLSX.utils.json_to_sheet(rentalData.length ? rentalData : [{ "Нет данных за период": "" }]);
  rentalSheet["!cols"] = [{ wch: 25 }, { wch: 8 }, { wch: 10 }, { wch: 25 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, rentalSheet, "Аренда");

  const summaryData = [
    { "Показатель": "Период с", "Значение": from ? String(from) : "—" },
    { "Показатель": "Период по", "Значение": to ? String(to) : "—" },
    { "Показатель": "", "Значение": "" },
    { "Показатель": "Общая стоимость склада (сом)", "Значение": totalStockValue },
    { "Показатель": "Итого поступления (сом)", "Значение": totalReceipts },
    { "Показатель": "Итого списания / убытки (сом)", "Значение": totalWriteOffs },
    { "Показатель": "Активных аренд", "Значение": activeRentals },
    { "Показатель": "Позиций на складе", "Значение": stockRows.length },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Итого");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const dateTag = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="msklad-report-${dateTag}.xlsx"`);
  res.send(buf);
});

export default router;
