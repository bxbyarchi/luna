import { Telegraf } from "telegraf";
import { db } from "@workspace/db";
import { itemsTable, writeOffsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

interface BreakageState {
  step: "await_item" | "await_qty" | "await_reason";
  itemId?: number;
  itemName?: string;
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
      "Добро пожаловать в *M-Sklad* 🏪\n\n" +
        "Доступные команды:\n" +
        "/breakage — зарегистрировать списание/бой\n" +
        "/cancel — отменить текущую операцию",
      { parse_mode: "Markdown" }
    );
  });

  bot.command("cancel", (ctx) => {
    states.delete(ctx.chat.id);
    ctx.reply("Операция отменена.");
  });

  bot.command("breakage", async (ctx) => {
    try {
      const items = await db
        .select({ id: itemsTable.id, name: itemsTable.name, unit: itemsTable.unit })
        .from(itemsTable)
        .orderBy(itemsTable.name)
        .limit(30);

      if (!items.length) {
        ctx.reply("В базе нет позиций. Добавьте товары через веб-интерфейс.");
        return;
      }

      states.set(ctx.chat.id, { step: "await_item" });

      const list = items
        .map((it, i) => `${i + 1}. ${it.name} (${it.unit})`)
        .join("\n");

      ctx.reply(
        `📋 *Списание товара*\n\nВыберите позицию (введите номер):\n\n${list}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      logger.error({ err }, "Telegram /breakage error");
      ctx.reply("Произошла ошибка. Попробуйте снова.");
    }
  });

  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const state = states.get(chatId);
    if (!state) return;

    const text = ctx.message.text.trim();

    if (state.step === "await_item") {
      const items = await db
        .select({ id: itemsTable.id, name: itemsTable.name, unit: itemsTable.unit })
        .from(itemsTable)
        .orderBy(itemsTable.name)
        .limit(30);

      const idx = Number(text) - 1;
      if (isNaN(idx) || idx < 0 || idx >= items.length) {
        ctx.reply("Введите номер позиции из списка.");
        return;
      }

      const item = items[idx];
      states.set(chatId, { step: "await_qty", itemId: item.id, itemName: item.name });
      ctx.reply(`Позиция: *${item.name}*\n\nВведите количество:`, { parse_mode: "Markdown" });
      return;
    }

    if (state.step === "await_qty") {
      const qty = Number(text.replace(",", "."));
      if (isNaN(qty) || qty <= 0) {
        ctx.reply("Введите положительное число.");
        return;
      }

      states.set(chatId, { ...state, step: "await_reason", qty });
      const reasonList = REASONS.map((r, i) => `${i + 1}. ${r}`).join("\n");
      ctx.reply(
        `Количество: *${qty}*\n\nВыберите причину (введите номер):\n\n${reasonList}`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (state.step === "await_reason") {
      const idx = Number(text) - 1;
      if (isNaN(idx) || idx < 0 || idx >= REASONS.length) {
        ctx.reply("Введите номер причины из списка.");
        return;
      }

      const reason = REASONS[idx];
      const { itemId, itemName, qty } = state;
      states.delete(chatId);

      if (!itemId || !qty) {
        ctx.reply("Ошибка сессии. Начните заново с /breakage");
        return;
      }

      try {
        const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, itemId) });
        const totalValue = item ? Number(item.pricePerUnit) * qty : 0;

        await db.insert(writeOffsTable).values({
          itemId,
          quantity: String(qty),
          reason,
          totalValue: String(totalValue),
          notes: "Списание через Telegram-бот",
        });

        await db
          .update(itemsTable)
          .set({
            currentStock: sql`GREATEST(0, CAST(${itemsTable.currentStock} AS DECIMAL) - ${qty})`,
          })
          .where(eq(itemsTable.id, itemId));

        ctx.reply(
          `✅ Списание зарегистрировано:\n\n*${itemName}* — ${qty} ед.\nПричина: ${reason}\nСумма: ${totalValue.toFixed(2)} ₽`,
          { parse_mode: "Markdown" }
        );

        const [updated] = await db
          .select({ currentStock: itemsTable.currentStock, minThreshold: itemsTable.minThreshold })
          .from(itemsTable)
          .where(eq(itemsTable.id, itemId));

        if (
          updated?.minThreshold &&
          Number(updated.currentStock) <= Number(updated.minThreshold)
        ) {
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
    }
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
