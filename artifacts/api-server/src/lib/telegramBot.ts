import { Telegraf, type Context } from "telegraf";
import { db } from "@workspace/db";
import { itemsTable, writeOffsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

export function initTelegramBot(): void {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.info("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  bot = new Telegraf(token);

  bot.start((ctx) => {
    states.delete(ctx.chat.id);
    ctx.reply(
      "Добро пожаловать в *M-Sklad* 🏪\n\nВыберите действие:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📸 Зарегистрировать бой/списание", callback_data: "start_breakage" }],
            [{ text: "❌ Отменить операцию", callback_data: "cancel" }],
          ],
        },
      }
    );
  });

  bot.command("cancel", (ctx) => {
    states.delete(ctx.chat.id);
    ctx.reply("Операция отменена.");
  });

  bot.command("breakage", async (ctx) => {
    await showItemSelector(ctx as Parameters<typeof showItemSelector>[0]);
  });

  bot.action("start_breakage", async (ctx) => {
    await ctx.answerCbQuery();
    await showItemSelector(ctx as Parameters<typeof showItemSelector>[0]);
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
        `✅ Списание зарегистрировано:\n\n*${itemName}* — ${qty} ${itemUnit ?? "ед."}\nПричина: ${reason}\nСумма: ${totalValue.toFixed(2)} ₽`,
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
    .then(() => logger.info("Telegram bot started"))
    .catch((err) => logger.error({ err }, "Failed to start Telegram bot"));

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
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
