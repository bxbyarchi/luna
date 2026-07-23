import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { receiptsTable, itemsTable, usersTable } from "@workspace/db";
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
      photoUrls: receiptsTable.photoUrls,
      notes: receiptsTable.notes,
      createdAt: receiptsTable.createdAt,
      recordedByName: sql<string | null>`NULLIF(TRIM(COALESCE(${usersTable.firstName}, '') || ' ' || COALESCE(${usersTable.lastName}, '')), '')`,
    })
    .from(receiptsTable)
    .leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id))
    .leftJoin(usersTable, eq(receiptsTable.recordedByClerkId, usersTable.clerkUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${receiptsTable.createdAt} DESC`);

  res.json(rows);
});

router.post("/receipts", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const { itemId, quantity, pricePerUnit, supplier, photoUrl, photoUrls, notes } = req.body;
  if (!itemId || !quantity || !pricePerUnit) {
    res.status(400).json({ error: "itemId, quantity, pricePerUnit required" });
    return;
  }
  const qty = Number(quantity);
  const price = Number(pricePerUnit);
  const total = qty * price;

  const normalizedPhotoUrls: string[] = Array.isArray(photoUrls) ? photoUrls : (photoUrl ? [photoUrl] : []);
  const primaryPhotoUrl = normalizedPhotoUrls[0] ?? photoUrl ?? null;

  const [row] = await db.insert(receiptsTable).values({
    itemId: Number(itemId),
    quantity: String(qty),
    pricePerUnit: String(price),
    totalCost: String(total),
    supplier,
    photoUrl: primaryPhotoUrl,
    photoUrls: normalizedPhotoUrls,
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
      photoUrls: receiptsTable.photoUrls,
      notes: receiptsTable.notes,
      createdAt: receiptsTable.createdAt,
    })
    .from(receiptsTable)
    .leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id))
    .where(eq(receiptsTable.id, id));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/receipts/:id", requireAuth(), requireRole("manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  const [existing] = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { quantity, pricePerUnit, supplier, photoUrl, photoUrls, notes } = req.body;

  const oldQty = Number(existing.quantity);
  const newQty = quantity !== undefined ? Number(quantity) : oldQty;
  const newPrice = pricePerUnit !== undefined ? Number(pricePerUnit) : Number(existing.pricePerUnit);
  const newTotal = newQty * newPrice;

  const normalizedPhotoUrls: string[] | undefined =
    photoUrls !== undefined
      ? (Array.isArray(photoUrls) ? photoUrls : (photoUrl ? [photoUrl] : []))
      : undefined;
  const primaryPhotoUrl =
    normalizedPhotoUrls !== undefined
      ? (normalizedPhotoUrls[0] ?? null)
      : (photoUrl !== undefined ? photoUrl : existing.photoUrl);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(receiptsTable)
      .set({
        ...(quantity !== undefined && { quantity: String(newQty) }),
        ...(pricePerUnit !== undefined && { pricePerUnit: String(newPrice) }),
        totalCost: String(newTotal),
        ...(supplier !== undefined && { supplier }),
        ...(photoUrl !== undefined || photoUrls !== undefined ? { photoUrl: primaryPhotoUrl } : {}),
        ...(normalizedPhotoUrls !== undefined && { photoUrls: normalizedPhotoUrls }),
        ...(notes !== undefined && { notes }),
      })
      .where(eq(receiptsTable.id, id))
      .returning();

    if (quantity !== undefined) {
      const qtyDelta = newQty - oldQty;
      await tx
        .update(itemsTable)
        .set({ currentStock: sql`CAST(${itemsTable.currentStock} AS DECIMAL) + ${qtyDelta}` })
        .where(eq(itemsTable.id, existing.itemId));
    }

    return row;
  });

  await logAudit({ action: "update", entityType: "receipt", entityId: id, clerkUserId: req.auth?.userId });
  res.json(updated);
});

router.delete("/receipts/:id", requireAuth(), requireRole("manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  const [existing] = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const qty = Number(existing.quantity);

  await db.transaction(async (tx) => {
    await tx.delete(receiptsTable).where(eq(receiptsTable.id, id));
    await tx
      .update(itemsTable)
      .set({ currentStock: sql`CAST(${itemsTable.currentStock} AS DECIMAL) - ${qty}` })
      .where(eq(itemsTable.id, existing.itemId));
  });

  await logAudit({ action: "delete", entityType: "receipt", entityId: id, clerkUserId: req.auth?.userId });
  res.status(204).send();
});

export default router;
