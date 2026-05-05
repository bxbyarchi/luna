import { Telegraf, type Context } from "telegraf";
import { db } from "@workspace/db";
import { itemsTable, writeOffsTable, rentalsTable, usersTable } from "@workspace/db";
import { eq, sql, and, lt } from "drizzle-orm";
import { logger } from "./logger";
import { logAudit } from "./auditLogger";

interface BreakageState {
  step: "await_item" | "await_qty" | "await_reason";
  itemId?: number;
  itemName?: string;
  itemUnit?: string;
  qty?: number;
}

const states = new Map<number, BreakageState>();

const REASONS = [
  "Бой/повреждение",
  "Порча",
  "Хищение",
  "Естественная убыль",
  "Списание по акту",
  "Иное",
];

let bot: Telegraf | null = null;

async function getUserRole(chatId: number): Promise<string | null> {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.telegramChatId, String(chatId)),
    });
    return user?.role ?? null;
  } catch {
    return null;
  }
}

async function showItemSelector(ctx: Context & { chat: { id: number } }) {
  try {
    const items = await db
      .select({ id: itemsTable.id, name: itemsTable.name, unit: itemsTable.unit })
      .from(itemsTable)
      .orderBy(itemsTable.name)
      .limit(25);

    if (!items.length) {
      await ctx.reply("В базе нет позиций. Добавьте товары через веб-интерфейс.");
      return;
    }

    states.set(ctx.chat.id, { step: "await_item" });

    const keyboard = items.map((it) => [
      { text: `${it.name} (${it.unit})`, callback_data: `item_${it.id}` },
    ]);

    await ctx.reply("📋 *Выберите позицию для списания:*", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    logger.error({ err }, "Telegram showItemSelector error");
    await ctx.reply("Произошла ошибка. Попробуйте снова.");
  }
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Завхоз",
    manager: "Админ",
    accountant: "Управляющая",
    warehouse: "Бухгалтер",
  };
  return labels[role] ?? role;
}

async function showMainMenu(ctx: Context & { chat: { id: number } }) {
  const chatId = ctx.chat.id;
  const role = await getUserRole(chatId);

  if (!role) {
    await ctx.reply(
      "👋 Добро пожаловать в *M-Sklad*!\n\nВаш аккаунт не привязан к системе.\nПерейдите в *Настройки → Telegram* в веб-интерфейсе и введите ваш Chat ID: `" + chatId + "`",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Мой Chat ID: " + chatId, callback_data: "show_chatid" }],
          ],
        },
      }
    );
    return;
  }

  const canWrite = role === "admin" || role === "manager";
  const roleLabel = getRoleLabel(role);

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  if (canWrite) {
    keyboard.push([{ text: "📸 Зарегистрировать бой/списание", callback_data: "start_breakage" }]);
  }

  keyboard.push([{ text: "📦 Остатки на складе", callback_data: "show_stock" }]);
  keyboard.push([{ text: "🏷️ Активные аренды", callback_data: "show_rentals" }]);
  keyboard.push([{ text: "ℹ️ Мой профиль", callback_data: "show_profile" }]);

  if (canWrite) {
    keyboard.push([{ text: "❌ Отменить операцию", callback_data: "cancel" }]);
  }

  await ctx.reply(
    `🏪 *M-Sklad*\n\nВы вошли как *${roleLabel}*.\nВыберите действие:`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    }
  );
}

export function initTelegramBot(): void {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.info("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  bot = new Telegraf(token);

  bot.start(async (ctx) => {
    states.delete(ctx.chat.id);
    await showMainMenu(ctx as Parameters<typeof showMainMenu>[0]);
  });

  bot.command("menu", async (ctx) => {
    states.delete(ctx.chat.id);
    await showMainMenu(ctx as Parameters<typeof showMainMenu>[0]);
  });

  bot.command("myid", async (ctx) => {
    await ctx.reply(
      `Ваш Telegram Chat ID: \`${ctx.chat.id}\`\n\nВставьте это значение в *Настройки → Telegram* в веб-интерфейсе M-Sklad.`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("cancel", (ctx) => {
    states.delete(ctx.chat.id);
    ctx.reply("Операция отменена.");
  });

  bot.command("breakage", async (ctx) => {
    const role = await getUserRole(ctx.chat.id);
    if (role !== "admin" && role !== "manager") {
      await ctx.reply("⛔ У вас нет прав для регистрации списания.");
      return;
    }
    await showItemSelector(ctx as Parameters<typeof showItemSelector>[0]);
  });

  bot.action("start_breakage", async (ctx) => {
    await ctx.answerCbQuery();
    const role = await getUserRole(ctx.chat!.id);
    if (role !== "admin" && role !== "manager") {
      await ctx.reply("⛔ У вас нет прав для регистрации списания.");
      return;
    }
    await showItemSelector(ctx as Parameters<typeof showItemSelector>[0]);
  });

  bot.action("show_chatid", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(`Ваш Chat ID: \`${ctx.chat!.id}\``, { parse_mode: "Markdown" });
  });

  bot.action("show_profile", async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const role = await getUserRole(chatId);
    if (!role) {
      await ctx.reply("Аккаунт не привязан. Используйте /myid чтобы получить ваш Chat ID.");
      return;
    }
    await ctx.reply(
      `👤 *Профиль*\n\nРоль: *${getRoleLabel(role)}*\nChat ID: \`${chatId}\``,
      { parse_mode: "Markdown" }
    );
  });

  bot.action("show_stock", async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const items = await db
        .select({ name: itemsTable.name, currentStock: itemsTable.currentStock, unit: itemsTable.unit, minThreshold: itemsTable.minThreshold })
        .from(itemsTable)
        .orderBy(itemsTable.name)
        .limit(20);

      if (!items.length) {
        await ctx.reply("Позиций на складе нет.");
        return;
      }

      const lines = items.map((it) => {
        const stock = Number(it.currentStock).toFixed(2);
        const min = it.minThreshold ? Number(it.minThreshold) : null;
        const warn = min !== null && Number(it.currentStock) <= min ? " ⚠️" : "";
        return `• ${it.name}: *${stock} ${it.unit}*${warn}`;
      });

      await ctx.reply(
        `📦 *Остатки на складе*\n\n${lines.join("\n")}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      logger.error({ err }, "show_stock error");
      await ctx.reply("Ошибка при получении данных.");
    }
  });

  bot.action("show_rentals", async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const rentals = await db
        .select({
          renterName: rentalsTable.renterName,
          renterPhone: rentalsTable.renterPhone,
          quantity: rentalsTable.quantity,
          plannedReturnAt: rentalsTable.plannedReturnAt,
          itemName: itemsTable.name,
          itemUnit: itemsTable.unit,
          status: rentalsTable.status,
        })
        .from(rentalsTable)
        .leftJoin(itemsTable, eq(rentalsTable.itemId, itemsTable.id))
        .where(eq(rentalsTable.status, "active"))
        .limit(15);

      if (!rentals.length) {
        await ctx.reply("Активных аренд нет.");
        return;
      }

      const now = new Date();
      const lines = rentals.map((r) => {
        const overdue = r.plannedReturnAt < now ? " 🔴 ПРОСРОЧЕНО" : "";
        const date = r.plannedReturnAt.toLocaleDateString("ru-RU");
        return `• *${r.itemName}* × ${r.quantity} ${r.itemUnit}\n  ${r.renterName}${r.renterPhone ? ` (${r.renterPhone})` : ""} — до ${date}${overdue}`;
      });

      await ctx.reply(
        `🏷️ *Активные аренды*\n\n${lines.join("\n\n")}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      logger.error({ err }, "show_rentals error");
      await ctx.reply("Ошибка при получении данных.");
    }
  });

  bot.action("cancel", async (ctx) => {
    await ctx.answerCbQuery("Отменено");
    states.delete(ctx.chat!.id);
    ctx.reply("Операция отменена.");
  });

  bot.action(/^item_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const itemId = Number(ctx.match[1]);

    try {
      const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, itemId) });
      if (!item) {
        ctx.reply("Позиция не найдена.");
        return;
      }

      states.set(chatId, { step: "await_qty", itemId: item.id, itemName: item.name, itemUnit: item.unit });
      ctx.reply(`Позиция: *${item.name}*\n\nВведите количество:`, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error({ err }, "Telegram item select error");
      ctx.reply("Ошибка. Попробуйте снова.");
    }
  });

  bot.action(/^reason_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const state = states.get(chatId);

    if (!state || state.step !== "await_reason") {
      ctx.reply("Сессия устарела. Начните заново с /breakage");
      return;
    }

    const idx = Number(ctx.match[1]);
    if (idx < 0 || idx >= REASONS.length) {
      ctx.reply("Неверный выбор.");
      return;
    }

    const reason = REASONS[idx];
    const { itemId, itemName, itemUnit, qty } = state;
    states.delete(chatId);

    if (!itemId || !qty) {
      ctx.reply("Ошибка сессии. Начните заново с /breakage");
      return;
    }

    try {
      const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, itemId) });
      const totalValue = item ? Number(item.pricePerUnit) * qty : 0;

      const [woRow] = await db.insert(writeOffsTable).values({
        itemId,
        quantity: String(qty),
        reason,
        totalValue: String(totalValue),
        notes: "Списание через Telegram-бот",
      }).returning({ id: writeOffsTable.id });

      await logAudit({
        action: "create",
        entityType: "write-off",
        entityId: woRow?.id,
        details: `Telegram bot: ${itemName} × ${qty} (${reason})`,
      });

      await db
        .update(itemsTable)
        .set({ currentStock: sql`GREATEST(0, CAST(${itemsTable.currentStock} AS DECIMAL) - ${qty})` })
        .where(eq(itemsTable.id, itemId));

      await ctx.reply(
        `✅ Списание зарегистрировано:\n\n*${itemName}* — ${qty} ${itemUnit ?? "ед."}\nПричина: ${reason}\nСумма: ${totalValue.toFixed(2)} сом`,
        { parse_mode: "Markdown" }
      );

      const [updated] = await db
        .select({ currentStock: itemsTable.currentStock, minThreshold: itemsTable.minThreshold })
        .from(itemsTable)
        .where(eq(itemsTable.id, itemId));

      if (updated?.minThreshold && Number(updated.currentStock) <= Number(updated.minThreshold)) {
        await sendLowStockAlert(
          itemName ?? "Неизвестно",
          Number(updated.currentStock),
          Number(updated.minThreshold),
          item?.unit ?? "ед."
        );
      }
    } catch (err) {
      logger.error({ err }, "Telegram breakage write-off error");
      ctx.reply("Ошибка при сохранении. Попробуйте снова.");
    }
  });

  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const state = states.get(chatId);
    if (!state || state.step !== "await_qty") return;

    const text = ctx.message.text.trim();
    const qty = Number(text.replace(",", "."));

    if (isNaN(qty) || qty <= 0) {
      ctx.reply("Введите положительное число.");
      return;
    }

    states.set(chatId, { ...state, step: "await_reason", qty });

    const reasonKeyboard = REASONS.map((r, i) => [
      { text: r, callback_data: `reason_${i}` },
    ]);

    ctx.reply(`Количество: *${qty}*\n\nВыберите причину:`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: reasonKeyboard },
    });
  });

  bot
    .launch()
    .then(() => {
      logger.info("Telegram bot started");
      void checkOverdueRentals();
      setInterval(() => { void checkOverdueRentals(); }, 60 * 60 * 1000);
    })
    .catch((err) => logger.error({ err }, "Failed to start Telegram bot"));

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
}

export async function sendOverdueRentalAlert(
  itemName: string,
  renterName: string,
  renterPhone: string | null,
  plannedReturnAt: Date,
  quantity: number,
  itemUnit: string
): Promise<void> {
  const adminChatId = process.env["TELEGRAM_ADMIN_CHAT_ID"];
  if (!bot || !adminChatId) return;

  const dateStr = plannedReturnAt.toLocaleDateString("ru-RU");
  const phone = renterPhone ? `\nТелефон: ${renterPhone}` : "";
  try {
    await bot.telegram.sendMessage(
      adminChatId,
      `🔴 *Просрочена аренда*\n\n*Товар:* ${itemName} × ${quantity} ${itemUnit}\n*Арендатор:* ${renterName}${phone}\n*Планируемый возврат:* ${dateStr}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error({ err }, "Failed to send overdue rental Telegram alert");
  }
}

async function checkOverdueRentals(): Promise<void> {
  const adminChatId = process.env["TELEGRAM_ADMIN_CHAT_ID"];
  if (!bot || !adminChatId) return;

  try {
    const now = new Date();
    const overdueRentals = await db
      .select({
        id: rentalsTable.id,
        itemId: rentalsTable.itemId,
        renterName: rentalsTable.renterName,
        renterPhone: rentalsTable.renterPhone,
        plannedReturnAt: rentalsTable.plannedReturnAt,
        quantity: rentalsTable.quantity,
        itemName: itemsTable.name,
        itemUnit: itemsTable.unit,
      })
      .from(rentalsTable)
      .leftJoin(itemsTable, eq(rentalsTable.itemId, itemsTable.id))
      .where(and(eq(rentalsTable.status, "active"), lt(rentalsTable.plannedReturnAt, now)));

    for (const r of overdueRentals) {
      await sendOverdueRentalAlert(
        r.itemName ?? "Unknown",
        r.renterName,
        r.renterPhone ?? null,
        r.plannedReturnAt,
        Number(r.quantity),
        r.itemUnit ?? ""
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to check overdue rentals");
  }
}

export async function sendLowStockAlert(
  itemName: string,
  currentStock: number,
  minThreshold: number,
  unit: string
): Promise<void> {
  const adminChatId = process.env["TELEGRAM_ADMIN_CHAT_ID"];
  if (!bot || !adminChatId) return;

  try {
    await bot.telegram.sendMessage(
      adminChatId,
      `⚠️ *Низкий остаток*\n\n*${itemName}*: ${currentStock} ${unit}\nМинимум: ${minThreshold} ${unit}\n\nПроверьте запасы в M-Sklad.`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error({ err }, "Failed to send low-stock Telegram alert");
  }
}
