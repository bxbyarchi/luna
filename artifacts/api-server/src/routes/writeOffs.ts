import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { writeOffsTable, itemsTable, staffTable, categoriesTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { sendLowStockAlert, sendHozkaLowStockAlert, sendWriteOffNotification } from "../lib/telegramBot";

const router: IRouter = Router();

router.get("/write-offs", requireAuth(), async (req: Request, res: Response) => {
  const { itemId, staffId, from, to } = req.query;
  const conditions = [];
  if (itemId) conditions.push(eq(writeOffsTable.itemId, Number(itemId)));
  if (staffId) conditions.push(eq(writeOffsTable.staffId, Number(staffId)));
  if (from) conditions.push(gte(writeOffsTable.createdAt, new Date(String(from))));
  if (to) conditions.push(lte(writeOffsTable.createdAt, new Date(String(to))));

  const rows = await db
    .select({
      id: writeOffsTable.id,
      itemId: writeOffsTable.itemId,
      itemName: itemsTable.name,
      quantity: writeOffsTable.quantity,
      reason: writeOffsTable.reason,
      staffId: writeOffsTable.staffId,
      staffName: staffTable.name,
      photoUrl: writeOffsTable.photoUrl,
      notes: writeOffsTable.notes,
      totalValue: writeOffsTable.totalValue,
      createdAt: writeOffsTable.createdAt,
    })
    .from(writeOffsTable)
    .leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id))
    .leftJoin(staffTable, eq(writeOffsTable.staffId, staffTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${writeOffsTable.createdAt} DESC`);

  res.json(rows);
});

router.post("/write-offs", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { itemId, quantity, reason, staffId, photoUrl, notes } = req.body;
  if (!itemId || !quantity || !reason) {
    res.status(400).json({ error: "itemId, quantity, reason required" });
    return;
  }

  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, Number(itemId)) });
  const totalValue = item ? Number(item.pricePerUnit) * Number(quantity) : 0;

  const [row] = await db.insert(writeOffsTable).values({
    itemId: Number(itemId),
    quantity: String(Number(quantity)),
    reason,
    staffId: staffId ? Number(staffId) : null,
    photoUrl: photoUrl || null,
    notes,
    totalValue: String(totalValue),
    recordedByClerkId: req.auth?.userId,
  }).returning();

  await db
    .update(itemsTable)
    .set({ currentStock: sql`GREATEST(0, CAST(${itemsTable.currentStock} AS DECIMAL) - ${Number(quantity)})` })
    .where(eq(itemsTable.id, Number(itemId)));

  const [updated] = await db
    .select({
      currentStock: itemsTable.currentStock,
      minThreshold: itemsTable.minThreshold,
      name: itemsTable.name,
      unit: itemsTable.unit,
      categoryName: categoriesTable.name,
      categorySlug: categoriesTable.slug,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(eq(itemsTable.id, Number(itemId)));

  if (updated?.minThreshold && Number(updated.currentStock) <= Number(updated.minThreshold)) {
    const isHozka = updated.categoryName?.toLowerCase().includes("хозка") ||
                    updated.categorySlug?.toLowerCase().includes("hozka") ||
                    updated.categorySlug?.toLowerCase().includes("hoz");
    if (isHozka) {
      void sendHozkaLowStockAlert(updated.name, Number(updated.currentStock), updated.unit);
    } else {
      void sendLowStockAlert(updated.name, Number(updated.currentStock), Number(updated.minThreshold), updated.unit);
    }
  }

  // Fetch staff name for the write-off notification
  let staffName: string | null = null;
  if (staffId) {
    const [staffRow] = await db.select({ name: staffTable.name }).from(staffTable).where(eq(staffTable.id, Number(staffId)));
    staffName = staffRow?.name ?? null;
  }

  void sendWriteOffNotification({
    itemName: updated?.name ?? "—",
    unit: updated?.unit ?? "ед.",
    quantity: Number(quantity),
    reason,
    totalValue,
    staffName,
    recordedByName: null,
  });

  await logAudit({ action: "create", entityType: "write_off", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.get("/write-offs/:id", requireAuth(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({
      id: writeOffsTable.id,
      itemId: writeOffsTable.itemId,
      itemName: itemsTable.name,
      quantity: writeOffsTable.quantity,
      reason: writeOffsTable.reason,
      staffId: writeOffsTable.staffId,
      staffName: staffTable.name,
      photoUrl: writeOffsTable.photoUrl,
      notes: writeOffsTable.notes,
      totalValue: writeOffsTable.totalValue,
      createdAt: writeOffsTable.createdAt,
    })
    .from(writeOffsTable)
    .leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id))
    .leftJoin(staffTable, eq(writeOffsTable.staffId, staffTable.id))
    .where(eq(writeOffsTable.id, id));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
