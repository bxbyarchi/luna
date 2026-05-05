import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { appSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

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

// ─── Org settings ───────────────────────────────────────────────────────────

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

// ─── User management ─────────────────────────────────────────────────────────

router.get("/admin/users", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const users = await db.query.usersTable.findMany({ orderBy: (u, { asc }) => [asc(u.createdAt)] });
  res.json(users);
});

/** Create a Clerk user + insert into usersTable */
router.post("/admin/users", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const { firstName, lastName, email, password, role } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    role?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "Email и пароль обязательны" });
    return;
  }

  const validRoles = ["admin", "manager", "accountant", "warehouse"];
  const assignedRole = role && validRoles.includes(role) ? role : "warehouse";

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    res.status(503).json({ error: "CLERK_SECRET_KEY не настроен" });
    return;
  }

  try {
    // Create user in Clerk
    const clerkRes = await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: firstName ?? "",
        last_name: lastName ?? "",
        email_address: [email],
        password,
        skip_password_checks: false,
        skip_password_requirement: false,
      }),
    });

    if (!clerkRes.ok) {
      const errBody = await clerkRes.json() as { errors?: Array<{ message?: string; long_message?: string }> };
      const msg = errBody?.errors?.[0]?.long_message ?? errBody?.errors?.[0]?.message ?? "Ошибка создания пользователя в Clerk";
      res.status(clerkRes.status).json({ error: msg });
      return;
    }

    const clerkUser = await clerkRes.json() as { id: string; email_addresses?: Array<{ email_address: string }> };
    const clerkUserId = clerkUser.id;
    const resolvedEmail = clerkUser.email_addresses?.[0]?.email_address ?? email;

    // Upsert into our usersTable
    const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkUserId, clerkUserId) });
    let dbUser;
    if (existing) {
      [dbUser] = await db.update(usersTable).set({ role: assignedRole, email: resolvedEmail, firstName: firstName ?? null, lastName: lastName ?? null }).where(eq(usersTable.clerkUserId, clerkUserId)).returning();
    } else {
      [dbUser] = await db.insert(usersTable).values({
        clerkUserId,
        email: resolvedEmail,
        role: assignedRole,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
      }).returning();
    }

    res.status(201).json(dbUser);
  } catch (err) {
    logger.error({ err }, "Failed to create user");
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

/** Change user role */
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

/** Delete user from DB (also removes from Clerk if possible) */
router.delete("/admin/users/:id", requireAuth(), async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const requestingClerkId = req.auth?.userId;
  const id = Number(req.params.id);

  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Prevent self-deletion
  if (target.clerkUserId === requestingClerkId) {
    res.status(400).json({ error: "Нельзя удалить свой собственный аккаунт" });
    return;
  }

  // Try to delete from Clerk (non-blocking — DB deletion happens regardless)
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (clerkSecretKey && target.clerkUserId) {
    try {
      await fetch(`https://api.clerk.com/v1/users/${target.clerkUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      });
    } catch (err) {
      logger.warn({ err }, "Failed to delete user from Clerk, continuing with DB deletion");
    }
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

// ─── Telegram (per-user chat ID link) ────────────────────────────────────────

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
