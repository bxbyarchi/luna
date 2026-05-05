import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { appSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateSettings() {
  let settings = await db.query.appSettingsTable.findFirst();
  if (!settings) {
    [settings] = await db.insert(appSettingsTable).values({}).returning();
  }
  return settings!;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

router.get("/settings", requireAuth(), async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.put("/settings", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { orgName, currency, timezone } = req.body as { orgName?: string; currency?: string; timezone?: string };
  const settings = await getOrCreateSettings();
  const [updated] = await db
    .update(appSettingsTable)
    .set({
      ...(orgName !== undefined ? { orgName } : {}),
      ...(currency !== undefined ? { currency } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
    })
    .where(eq(appSettingsTable.id, settings.id))
    .returning();
  res.json(updated);
});

router.get("/admin/users", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const users = await db.query.usersTable.findMany({ orderBy: (u, { asc }) => [asc(u.createdAt)] });
  res.json(users);
});

router.patch("/admin/users/:id/role", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const { role } = req.body as { role?: string };
  const validRoles = ["admin", "manager", "accountant", "warehouse"];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(updated);
});

router.patch("/admin/users/me/telegram", requireAuth(), async (req: Request, res: Response) => {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { telegramChatId } = req.body as { telegramChatId?: string };
  const [updated] = await db
    .update(usersTable)
    .set({ telegramChatId: telegramChatId || null })
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .returning();
  res.json(updated);
});

router.get("/admin/telegram/status", requireAuth(), async (_req: Request, res: Response) => {
  const botConnected = !!process.env["TELEGRAM_BOT_TOKEN"];
  const adminChatConfigured = !!process.env["TELEGRAM_ADMIN_CHAT_ID"];
  res.json({ botConnected, adminChatConfigured });
});

export default router;
