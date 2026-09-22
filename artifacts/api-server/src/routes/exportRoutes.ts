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
import ExcelJS from "exceljs";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

const BRAND_HEADER_FILL = "3B0D14";
const BRAND_ACCENT_FILL = "F3C949";
const ZEBRA_FILL = "F7F2F0";
const BORDER_COLOR = "D9C6C3";
const CURRENCY_FMT = '#,##0.00 "сом"';

type ColumnSpec = { header: string; key: string; width: number; format?: "currency" | "integer" | "date" };

function fmt(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU");
}

function styleSheet(sheet: ExcelJS.Worksheet, columns: ColumnSpec[], rows: Record<string, unknown>[], opts?: { emptyLabel?: string }) {
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND_HEADER_FILL}` } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, bottom: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, left: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, right: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } } };
  });
  headerRow.height = 22;

  if (rows.length === 0) {
    const emptyRow = sheet.addRow([opts?.emptyLabel ?? "Нет данных за период"]);
    sheet.mergeCells(emptyRow.number, 1, emptyRow.number, columns.length);
    emptyRow.getCell(1).alignment = { horizontal: "center" };
    emptyRow.getCell(1).font = { italic: true, color: { argb: "FF8A6F6A" } };
    return;
  }

  rows.forEach((row, i) => {
    const dataRow = sheet.addRow(columns.map((c) => row[c.key] ?? ""));
    dataRow.eachCell((cell, colIdx) => {
      const spec = columns[colIdx - 1];
      if (spec.format === "currency") cell.numFmt = CURRENCY_FMT;
      if (spec.format === "integer") cell.numFmt = "#,##0";
      cell.border = { top: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, bottom: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, left: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, right: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } } };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ZEBRA_FILL}` } };
    });
  });
}

async function buildBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Северное сияние";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Остатки");
  styleSheet(sheet, [
    { header: "ID", key: "id", width: 8 },
    { header: "Наименование", key: "name", width: 32 },
    { header: "Категория", key: "category", width: 20 },
    { header: "Ед. изм.", key: "unit", width: 10 },
    { header: "Расположение", key: "location", width: 20 },
    { header: "Остаток", key: "currentStock", width: 12, format: "integer" },
    { header: "Мин. остаток", key: "minThreshold", width: 14, format: "integer" },
    { header: "Цена за ед.", key: "pricePerUnit", width: 16, format: "currency" },
    { header: "Общая стоимость", key: "totalValue", width: 18, format: "currency" },
  ], rows.map((r) => ({
    id: r.id, name: r.name, category: r.category ?? "—", unit: r.unit, location: r.location ?? "—",
    currentStock: Number(r.currentStock), minThreshold: r.minThreshold ? Number(r.minThreshold) : "",
    pricePerUnit: Number(r.pricePerUnit), totalValue: Number(r.totalValue),
  })));

  const buf = await buildBuffer(wb);
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Северное сияние";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Списания");
  styleSheet(sheet, [
    { header: "ID", key: "id", width: 8 },
    { header: "Позиция", key: "itemName", width: 30 },
    { header: "Количество", key: "quantity", width: 12, format: "integer" },
    { header: "Причина", key: "reason", width: 20 },
    { header: "Сотрудник", key: "staffName", width: 22 },
    { header: "Сумма списания", key: "totalValue", width: 16, format: "currency" },
    { header: "Дата", key: "createdAt", width: 14 },
  ], rows.map((r) => ({
    id: r.id, itemName: r.itemName ?? "—", quantity: Number(r.quantity), reason: r.reason,
    staffName: r.staffName ?? "—", totalValue: Number(r.totalValue), createdAt: fmt(r.createdAt),
  })));

  const buf = await buildBuffer(wb);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="write-offs-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

router.get("/reports/full", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { from, to, format, categoryId } = req.query;
  const fromDate = from ? new Date(String(from)) : undefined;
  const toDate = to ? new Date(String(to) + "T23:59:59") : undefined;
  const catId = categoryId ? Number(categoryId) : undefined;

  const stockConditions = [];
  if (catId) stockConditions.push(eq(itemsTable.categoryId, catId));

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
    .where(stockConditions.length ? and(...stockConditions) : undefined)
    .orderBy(categoriesTable.name, itemsTable.name);

  const receiptConditions = [];
  if (fromDate) receiptConditions.push(gte(receiptsTable.createdAt, fromDate));
  if (toDate) receiptConditions.push(lte(receiptsTable.createdAt, toDate));
  if (catId) receiptConditions.push(eq(itemsTable.categoryId, catId));

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

  const woConditions = [];
  if (fromDate) woConditions.push(gte(writeOffsTable.createdAt, fromDate));
  if (toDate) woConditions.push(lte(writeOffsTable.createdAt, toDate));
  if (catId) woConditions.push(eq(itemsTable.categoryId, catId));

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
  if (catId) rentalConditions.push(eq(itemsTable.categoryId, catId));

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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Северное сияние";
  wb.created = new Date();

  const summarySheet = wb.addWorksheet("Итого");
  summarySheet.columns = [{ key: "label", width: 38 }, { key: "value", width: 22 }];

  const titleRow = summarySheet.addRow(["Отчёт «Северное сияние»", ""]);
  summarySheet.mergeCells(titleRow.number, 1, titleRow.number, 2);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: `FF${BRAND_HEADER_FILL}` } };
  titleRow.height = 26;

  const periodRow = summarySheet.addRow([`Период: ${from ? String(from) : "начало"} — ${to ? String(to) : "сегодня"}`, ""]);
  summarySheet.mergeCells(periodRow.number, 1, periodRow.number, 2);
  periodRow.getCell(1).font = { italic: true, color: { argb: "FF8A6F6A" } };
  summarySheet.addRow([]);

  const metrics: Array<[string, number]> = [
    ["Общая стоимость склада", totalStockValue],
    ["Итого поступления", totalReceipts],
    ["Итого списания / убытки", totalWriteOffs],
  ];
  for (const [label, value] of metrics) {
    const row = summarySheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true, size: 12 };
    row.getCell(2).numFmt = CURRENCY_FMT;
    row.getCell(2).alignment = { horizontal: "right" };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND_ACCENT_FILL}` } };
      cell.border = { top: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, bottom: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, left: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } }, right: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } } };
    });
  }
  summarySheet.addRow([]);
  const countMetrics: Array<[string, number]> = [
    ["Активных аренд", activeRentals],
    ["Позиций на складе", stockRows.length],
  ];
  for (const [label, value] of countMetrics) {
    const row = summarySheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: "right" };
  }

  const stockSheet = wb.addWorksheet("Остатки");
  styleSheet(stockSheet, [
    { header: "Наименование", key: "name", width: 32 },
    { header: "Категория", key: "category", width: 20 },
    { header: "Ед. изм.", key: "unit", width: 10 },
    { header: "Остаток", key: "currentStock", width: 12, format: "integer" },
    { header: "Цена за ед.", key: "pricePerUnit", width: 16, format: "currency" },
    { header: "Сумма", key: "totalValue", width: 18, format: "currency" },
  ], stockRows.map((r) => ({
    name: r.name, category: r.category ?? "—", unit: r.unit,
    currentStock: Number(r.currentStock), pricePerUnit: Number(r.pricePerUnit), totalValue: Number(r.totalValue),
  })));

  const receiptSheet = wb.addWorksheet("Поступления");
  styleSheet(receiptSheet, [
    { header: "Дата", key: "date", width: 14 },
    { header: "Позиция", key: "itemName", width: 30 },
    { header: "Ед. изм.", key: "unit", width: 10 },
    { header: "Количество", key: "quantity", width: 12, format: "integer" },
    { header: "Цена за ед.", key: "pricePerUnit", width: 16, format: "currency" },
    { header: "Сумма", key: "totalCost", width: 16, format: "currency" },
    { header: "Поставщик", key: "supplier", width: 25 },
  ], receiptRows.map((r) => ({
    date: fmt(r.createdAt), itemName: r.itemName ?? "—", unit: r.unit ?? "",
    quantity: Number(r.quantity), pricePerUnit: Number(r.pricePerUnit), totalCost: Number(r.totalCost), supplier: r.supplier ?? "—",
  })));

  const writeOffSheet = wb.addWorksheet("Списания");
  styleSheet(writeOffSheet, [
    { header: "Дата", key: "date", width: 14 },
    { header: "Позиция", key: "itemName", width: 30 },
    { header: "Ед. изм.", key: "unit", width: 10 },
    { header: "Количество", key: "quantity", width: 12, format: "integer" },
    { header: "Сумма", key: "totalValue", width: 16, format: "currency" },
    { header: "Причина", key: "reason", width: 25 },
    { header: "Сотрудник", key: "staffName", width: 22 },
  ], writeOffRows.map((r) => ({
    date: fmt(r.createdAt), itemName: r.itemName ?? "—", unit: r.unit ?? "",
    quantity: Number(r.quantity), totalValue: Number(r.totalValue), reason: r.reason ?? "—", staffName: r.staffName ?? "—",
  })));

  const rentalSheet = wb.addWorksheet("Аренда");
  styleSheet(rentalSheet, [
    { header: "Позиция", key: "itemName", width: 25 },
    { header: "Ед. изм.", key: "unit", width: 8 },
    { header: "Количество", key: "quantity", width: 12, format: "integer" },
    { header: "Арендатор", key: "renterName", width: 25 },
    { header: "Телефон", key: "renterPhone", width: 16 },
    { header: "Выдано", key: "issuedAt", width: 14 },
    { header: "Возврат (план)", key: "plannedReturnAt", width: 16 },
    { header: "Возвращено", key: "returnedAt", width: 14 },
    { header: "Статус", key: "status", width: 14 },
  ], rentalRows.map((r) => ({
    itemName: r.itemName ?? "—", unit: r.itemUnit ?? "", quantity: Number(r.quantity),
    renterName: r.renterName, renterPhone: r.renterPhone ?? "—", issuedAt: fmt(r.issuedAt),
    plannedReturnAt: fmt(r.plannedReturnAt), returnedAt: fmt(r.returnedAt),
    status: r.status === "active" ? "Активна" : "Возвращена",
  })));

  const buf = await buildBuffer(wb);
  const dateTag = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="msklad-report-${dateTag}.xlsx"`);
  res.send(buf);
});

export default router;
