import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { inventoryAuditsTable, auditItemsTable, itemsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

router.get("/inventory-audits", requireAuth(), async (req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(inventoryAuditsTable)
    .orderBy(sql`${inventoryAuditsTable.createdAt} DESC`);
  res.json(rows);
});

router.post("/inventory-audits", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const { title } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const [audit] = await db.insert(inventoryAuditsTable).values({ title, status: "draft" }).returning();

  const items = await db.select().from(itemsTable);
  if (items.length > 0) {
    await db.insert(auditItemsTable).values(
      items.map((item) => ({
        auditId: audit.id,
        itemId: item.id,
        systemStock: item.currentStock,
        actualStock: null,
      }))
    );
  }

  await logAudit({ action: "create", entityType: "inventory_audit", entityId: audit.id, clerkUserId: req.auth?.userId });
  res.status(201).json(audit);
});

router.get("/inventory-audits/:id", requireAuth(), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const audit = await db.query.inventoryAuditsTable.findFirst({
    where: eq(inventoryAuditsTable.id, id),
  });
  if (!audit) { res.status(404).json({ error: "Not found" }); return; }

  const auditItems = await db
    .select({
      id: auditItemsTable.id,
      auditId: auditItemsTable.auditId,
      itemId: auditItemsTable.itemId,
      itemName: itemsTable.name,
      systemStock: auditItemsTable.systemStock,
      actualStock: auditItemsTable.actualStock,
      discrepancy: sql<string>`CASE WHEN ${auditItemsTable.actualStock} IS NOT NULL THEN CAST(${auditItemsTable.actualStock} AS DECIMAL) - CAST(${auditItemsTable.systemStock} AS DECIMAL) ELSE NULL END`,
    })
    .from(auditItemsTable)
    .leftJoin(itemsTable, eq(auditItemsTable.itemId, itemsTable.id))
    .where(eq(auditItemsTable.auditId, id));

  res.json({ ...audit, items: auditItems });
});

router.patch("/inventory-audits/:id", requireAuth(), requireRole("admin", "manager", "warehouse"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { items } = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: "items array required" }); return; }

  for (const item of items) {
    if (item.itemId !== undefined && item.actualStock !== undefined) {
      await db
        .update(auditItemsTable)
        .set({ actualStock: String(item.actualStock) })
        .where(
          sql`${auditItemsTable.auditId} = ${id} AND ${auditItemsTable.itemId} = ${Number(item.itemId)}`
        );
    }
  }

  const audit = await db.query.inventoryAuditsTable.findFirst({ where: eq(inventoryAuditsTable.id, id) });
  await logAudit({ action: "update", entityType: "inventory_audit", entityId: id, clerkUserId: req.auth?.userId, details: `Saved ${items.filter((i) => i.actualStock !== undefined).length} counts` });
  res.json(audit);
});

router.post("/inventory-audits/:id/submit", requireAuth(), requireRole("admin", "manager"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  const audit = await db.query.inventoryAuditsTable.findFirst({ where: eq(inventoryAuditsTable.id, id) });
  if (!audit) { res.status(404).json({ error: "Not found" }); return; }
  if (audit.status === "submitted") { res.status(400).json({ error: "Already submitted" }); return; }

  const auditItems = await db
    .select()
    .from(auditItemsTable)
    .where(eq(auditItemsTable.auditId, id));

  for (const auditItem of auditItems) {
    if (auditItem.actualStock !== null) {
      await db
        .update(itemsTable)
        .set({ currentStock: String(auditItem.actualStock) })
        .where(eq(itemsTable.id, auditItem.itemId));
    }
  }

  const [row] = await db
    .update(inventoryAuditsTable)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(inventoryAuditsTable.id, id))
    .returning();

  await logAudit({ action: "submit", entityType: "inventory_audit", entityId: id, clerkUserId: req.auth?.userId, details: `Applied ${auditItems.filter((i) => i.actualStock !== null).length} item counts` });
  res.json(row);
});

export default router;
