import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { rentalsTable, itemsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

function withOverdue(r: {
  id: number; itemId: number; itemName?: string | null; itemUnit?: string | null;
  quantity: string; renterName: string; renterPhone?: string | null;
  issuedAt: Date; plannedReturnAt: Date; status: string;
  returnedAt?: Date | null; notes?: string | null; createdAt: Date;
}) {
  return {
    ...r,
    quantity: Number(r.quantity),
    isOverdue: r.status === "active" && new Date() > new Date(r.plannedReturnAt),
  };
}

router.get("/rentals", requireAuth(), async (req: Request, res: Response) => {
  const { status } = req.query;
  const conditions = [];
  if (status === "active" || status === "returned") {
    conditions.push(eq(rentalsTable.status, String(status)));
  }

  const rows = await db
    .select({
      id: rentalsTable.id,
      itemId: rentalsTable.itemId,
      itemName: itemsTable.name,
      itemUnit: itemsTable.unit,
      quantity: rentalsTable.quantity,
      renterName: rentalsTable.renterName,
      renterPhone: rentalsTable.renterPhone,
      issuedAt: rentalsTable.issuedAt,
      plannedReturnAt: rentalsTable.plannedReturnAt,
      status: rentalsTable.status,
      returnedAt: rentalsTable.returnedAt,
      notes: rentalsTable.notes,
      createdAt: rentalsTable.createdAt,
    })
    .from(rentalsTable)
    .leftJoin(itemsTable, eq(rentalsTable.itemId, itemsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${rentalsTable.createdAt} DESC`);

  res.json(rows.map(withOverdue));
});

router.post("/rentals", requireAuth(), requireRole("admin", "manager", "warehouse"), async (req: Request, res: Response) => {
  const { itemId, quantity, renterName, renterPhone, issuedAt, plannedReturnAt, notes } = req.body;
  if (!itemId || !quantity || !renterName || !issuedAt || !plannedReturnAt) {
    res.status(400).json({ error: "itemId, quantity, renterName, issuedAt, plannedReturnAt required" });
    return;
  }
  const qty = Number(quantity);

  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, Number(itemId)) });
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  if (Number(item.currentStock) < qty) {
    res.status(409).json({ error: `Недостаточно товара. Доступно: ${item.currentStock} ${item.unit}` });
    return;
  }

  const [rental] = await db.insert(rentalsTable).values({
    itemId: Number(itemId),
    quantity: String(qty),
    renterName,
    renterPhone: renterPhone || null,
    issuedAt: new Date(issuedAt),
    plannedReturnAt: new Date(plannedReturnAt),
    status: "active",
    notes: notes || null,
  }).returning();

  await db
    .update(itemsTable)
    .set({ currentStock: sql`CAST(${itemsTable.currentStock} AS DECIMAL) - ${qty}` })
    .where(eq(itemsTable.id, Number(itemId)));

  await logAudit({ action: "create", entityType: "rental", entityId: rental.id, clerkUserId: req.auth?.userId, details: `${item.name} × ${qty} → ${renterName}` });
  res.status(201).json(withOverdue({ ...rental, itemName: item.name, itemUnit: item.unit }));
});

router.get("/rentals/:id", requireAuth(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({
      id: rentalsTable.id,
      itemId: rentalsTable.itemId,
      itemName: itemsTable.name,
      itemUnit: itemsTable.unit,
      quantity: rentalsTable.quantity,
      renterName: rentalsTable.renterName,
      renterPhone: rentalsTable.renterPhone,
      issuedAt: rentalsTable.issuedAt,
      plannedReturnAt: rentalsTable.plannedReturnAt,
      status: rentalsTable.status,
      returnedAt: rentalsTable.returnedAt,
      notes: rentalsTable.notes,
      createdAt: rentalsTable.createdAt,
    })
    .from(rentalsTable)
    .leftJoin(itemsTable, eq(rentalsTable.itemId, itemsTable.id))
    .where(eq(rentalsTable.id, id));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(withOverdue(row));
});

router.patch("/rentals/:id", requireAuth(), requireRole("admin", "manager", "warehouse"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status, renterName, renterPhone, plannedReturnAt, notes } = req.body;

  const existing = await db.query.rentalsTable.findFirst({ where: eq(rentalsTable.id, id) });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Record<string, unknown> = {};
  if (renterName !== undefined) updates.renterName = renterName;
  if (renterPhone !== undefined) updates.renterPhone = renterPhone;
  if (plannedReturnAt !== undefined) updates.plannedReturnAt = new Date(plannedReturnAt);
  if (notes !== undefined) updates.notes = notes;

  if (status === "returned" && existing.status === "active") {
    updates.status = "returned";
    updates.returnedAt = new Date();

    await db
      .update(itemsTable)
      .set({ currentStock: sql`CAST(${itemsTable.currentStock} AS DECIMAL) + ${Number(existing.quantity)}` })
      .where(eq(itemsTable.id, existing.itemId));
  } else if (status !== undefined) {
    updates.status = status;
  }

  const [updated] = await db
    .update(rentalsTable)
    .set(updates)
    .where(eq(rentalsTable.id, id))
    .returning();

  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, updated.itemId) });
  await logAudit({ action: "update", entityType: "rental", entityId: id, clerkUserId: req.auth?.userId, details: status ? `Статус: ${status}` : "Обновлено" });

  res.json(withOverdue({ ...updated, itemName: item?.name ?? null, itemUnit: item?.unit ?? null }));
});

export default router;
