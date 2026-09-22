import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db, cashMovementsTable, shiftsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "../lib/auditLogger";
import { requireVenueRole } from "../middleware/rbac";
import { getWarehouseScope } from "../lib/warehouseScope";
import { canAccessVenueLocation, getRegisterLocationId } from "../lib/venueScope";

const router: IRouter = Router();

router.get("/shifts/:id/cash-movements", requireAuth(), requireVenueRole("cashier"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const shiftId = Number(req.params.id);
  const shift = await db.query.shiftsTable.findFirst({ where: eq(shiftsTable.id, shiftId) });
  if (!shift) { res.status(404).json({ error: "Смена не найдена" }); return; }
  const locationId = await getRegisterLocationId(shift.registerId);
  if (!canAccessVenueLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа" }); return; }

  const rows = await db.select().from(cashMovementsTable).where(eq(cashMovementsTable.shiftId, shiftId)).orderBy(sql`${cashMovementsTable.createdAt} DESC`);
  res.json(rows);
});

router.post("/shifts/:id/cash-movements", requireAuth(), requireVenueRole("cashier"), async (req: Request, res: Response) => {
  const scope = await getWarehouseScope(req);
  if (!scope) { res.status(403).json({ error: "Пользователь не настроен" }); return; }
  const shiftId = Number(req.params.id);
  const { type, amount, note } = req.body as { type: "collection" | "deposit"; amount: number; note?: string };
  if (type !== "collection" && type !== "deposit") { res.status(400).json({ error: "type должен быть collection или deposit" }); return; }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { res.status(400).json({ error: "Некорректная сумма" }); return; }

  const shift = await db.query.shiftsTable.findFirst({ where: eq(shiftsTable.id, shiftId) });
  if (!shift) { res.status(404).json({ error: "Смена не найдена" }); return; }
  if (shift.status !== "open") { res.status(409).json({ error: "Смена закрыта" }); return; }
  const locationId = await getRegisterLocationId(shift.registerId);
  if (!canAccessVenueLocation(scope, locationId)) { res.status(403).json({ error: "Нет доступа" }); return; }

  const [row] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(cashMovementsTable).values({ shiftId, type, amount: String(amt), note, createdByClerkId: req.auth?.userId }).returning();
    if (type === "collection") {
      await tx.update(shiftsTable).set({ totalCollected: sql`${shiftsTable.totalCollected} + ${amt}` }).where(eq(shiftsTable.id, shiftId));
    } else {
      await tx.update(shiftsTable).set({ totalDeposited: sql`${shiftsTable.totalDeposited} + ${amt}` }).where(eq(shiftsTable.id, shiftId));
    }
    return [created];
  });

  await logAudit({ action: type === "collection" ? "cash_collection" : "cash_deposit", entityType: "shift", entityId: shiftId, clerkUserId: req.auth?.userId, details: `${amt} сом` });
  res.status(201).json(row);
});

export default router;
