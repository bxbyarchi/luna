import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { receiptsTable, itemsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";
import { sendLowStockAlert } from "../lib/telegramBot";

const router: IRouter = Router();

router.get("/receipts", requireAuth(), async (req: Request, res: Response) => {
  const { itemId, from, to } = req.query;
  const conditions = [];
  if (itemId) conditions.push(eq(receiptsTable.itemId, Number(itemId)));
  if (from) conditions.push(gte(receiptsTable.createdAt, new Date(String(from))));
  if (to) conditions.push(lte(receiptsTable.createdAt, new Date(String(to))));

  const rows = await db
    .select({
      id: receiptsTable.id,
      itemId: receiptsTable.itemId,
      itemName: itemsTable.name,
      quantity: receiptsTable.quantity,
      pricePerUnit: receiptsTable.pricePerUnit,
      totalCost: receiptsTable.totalCost,
      supplier: receiptsTable.supplier,
      photoUrl: receiptsTable.photoUrl,
      notes: receiptsTable.notes,
      createdAt: receiptsTable.createdAt,
    })
    .from(receiptsTable)
    .leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${receiptsTable.createdAt} DESC`);

  res.json(rows);
});

router.post("/receipts", requireAuth(), requireRole("admin", "manager", "warehouse"), async (req: Request, res: Response) => {
  const { itemId, quantity, pricePerUnit, supplier, photoUrl, notes } = req.body;
  if (!itemId || !quantity || !pricePerUnit) {
    res.status(400).json({ error: "itemId, quantity, pricePerUnit required" });
    return;
  }
  const qty = Number(quantity);
  const price = Number(pricePerUnit);
  const total = qty * price;

  const [row] = await db.insert(receiptsTable).values({
    itemId: Number(itemId),
    quantity: String(qty),
    pricePerUnit: String(price),
    totalCost: String(total),
    supplier,
    photoUrl: photoUrl || null,
    notes,
    recordedByClerkId: req.auth?.userId,
  }).returning();

  await db
    .update(itemsTable)
    .set({ currentStock: sql`CAST(${itemsTable.currentStock} AS DECIMAL) + ${qty}` })
    .where(eq(itemsTable.id, Number(itemId)));

  const [updated] = await db
    .select({ currentStock: itemsTable.currentStock, minThreshold: itemsTable.minThreshold, name: itemsTable.name, unit: itemsTable.unit })
    .from(itemsTable)
    .where(eq(itemsTable.id, Number(itemId)));

  if (updated?.minThreshold && Number(updated.currentStock) <= Number(updated.minThreshold)) {
    void sendLowStockAlert(updated.name, Number(updated.currentStock), Number(updated.minThreshold), updated.unit);
  }

  await logAudit({ action: "create", entityType: "receipt", entityId: row.id, clerkUserId: req.auth?.userId });
  res.status(201).json(row);
});

router.get("/receipts/:id", requireAuth(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({
      id: receiptsTable.id,
      itemId: receiptsTable.itemId,
      itemName: itemsTable.name,
      quantity: receiptsTable.quantity,
      pricePerUnit: receiptsTable.pricePerUnit,
      totalCost: receiptsTable.totalCost,
      supplier: receiptsTable.supplier,
      photoUrl: receiptsTable.photoUrl,
      notes: receiptsTable.notes,
      createdAt: receiptsTable.createdAt,
    })
    .from(receiptsTable)
    .leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id))
    .where(eq(receiptsTable.id, id));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
