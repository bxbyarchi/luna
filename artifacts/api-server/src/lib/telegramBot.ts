import { Telegraf, type Context } from "telegraf";
import { db } from "@workspace/db";
import {
  itemsTable,
  writeOffsTable,
  rentalsTable,
  usersTable,
  categoriesTable,
  receiptsTable,
  staffTable,
} from "@workspace/db";
import { eq, sql, and, lt, lte, gte } from "drizzle-orm";
import * as XLSX from "xlsx";
import { logger } from "./logger";
import { logAudit } from "./auditLogger";

// ---------------------------------------------------------------------------
// State maps
// ---------------------------------------------------------------------------
interface AuthState { step: "await_email" }
interface BreakageState {
  step: "await_item" | "await_qty" | "await_reason";
  itemId?: number;
  itemName?: string;
  itemUnit?: string;
  qty?: number;
}

const authStates = new Map<number, AuthState>();
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

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
async function getUserByChat(chatId: number) {
  try {
    return await db.query.usersTable.findFirst({
      where: eq(usersTable.telegramChatId, String(chatId)),
    });
  } catch {
    return null;
  }
}

async function getUserRole(chatId: number): Promise<string | null> {
  const user = await getUserByChat(chatId);
  return user?.role ?? null;
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Завхоз",
    manager: "Управляющий",
    accountant: "Бухгалтер",
    warehouse: "Кладовщик",
  };
  return labels[role] ?? role;
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------
async function showMainMenu(ctx: Context & { chat: { id: number } }) {
  const chatId = ctx.chat.id;
  const user = await getUserByChat(chatId);

  if (!user) {
    authStates.set(chatId, { step: "await_email" });
    await ctx.reply(
      "👋 Добро пожаловать в *M-Sklad*!\n\nДля входа введите ваш рабочий Email:",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const role = user.role;
  const isAdmin = role === "admin";
  const canReport = ["admin", "manager", "accountant"].includes(role);

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  keyboard.push([{ text: "📦 Остатки на складе", callback_data: "show_stock" }]);
  if (canReport) {
    keyboard.push([{ text: "📊 Отчёт по категории", callback_data: "report_pick_cat" }]);
  }
  if (isAdmin) {
    keyboard.push([{ text: "⚠️ Критический остаток", callback_data: "show_critical" }]);
    keyboard.push([{ text: "📸 Зарегистрировать списание", callback_data: "start_breakage" }]);
    keyboard.push([{ text: "🏷️ Активные аренды", callback_data: "show_rentals" }]);
  }
  keyboard.push([{ text: "👤 Профиль", callback_data: "show_profile" }]);

  await ctx.reply(
    `🏪 *M-Sklad* — добро пожаловать, *${getRoleLabel(role)}*!\n\nВыберите действие:`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } }
  );
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------
function getMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { from, to };
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function generateReportXlsx(categoryId?: number): Promise<Buffer> {
  const { from, to } = getMonthRange();

  const stockCond = categoryId ? [eq(itemsTable.categoryId, categoryId)] : [];
  const stockRows = await db
    .select({
      name: itemsTable.name,
      category: categoriesTable.name,
      unit: itemsTable.unit,
      currentStock: itemsTable.currentStock,
      pricePerUnit: itemsTable.pricePerUnit,
      totalValue: sql<string>`CAST(${itemsTable.currentStock} AS DECIMAL) * CAST(${itemsTable.pricePerUnit} AS DECIMAL)`,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(stockCond.length ? and(...stockCond) : undefined)
    .orderBy(categoriesTable.name, itemsTable.name);

  const rcCond: ReturnType<typeof gte>[] = [gte(receiptsTable.createdAt, from), lte(receiptsTable.createdAt, to)];
  if (categoryId) rcCond.push(eq(itemsTable.categoryId, categoryId) as ReturnType<typeof gte>);
  const receiptRows = await db
    .select({
      itemName: itemsTable.name,
      unit: itemsTable.unit,
      quantity: receiptsTable.quantity,
      pricePerUnit: receiptsTable.pricePerUnit,
      totalCost: receiptsTable.totalCost,
      supplier: receiptsTable.supplier,
      createdAt: receiptsTable.createdAt,
    })
    .from(receiptsTable)
    .leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id))
    .where(and(...rcCond))
    .orderBy(sql`${receiptsTable.createdAt} ASC`);

  const woCond: ReturnType<typeof gte>[] = [gte(writeOffsTable.createdAt, from), lte(writeOffsTable.createdAt, to)];
  if (categoryId) woCond.push(eq(itemsTable.categoryId, categoryId) as ReturnType<typeof gte>);
  const writeOffRows = await db
    .select({
      itemName: itemsTable.name,
      unit: itemsTable.unit,
      quantity: writeOffsTable.quantity,
      totalValue: writeOffsTable.totalValue,
      reason: writeOffsTable.reason,
      staffName: staffTable.name,
      createdAt: writeOffsTable.createdAt,
    })
    .from(writeOffsTable)
    .leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id))
    .leftJoin(staffTable, eq(writeOffsTable.staffId, staffTable.id))
    .where(and(...woCond))
    .orderBy(sql`${writeOffsTable.createdAt} ASC`);

  const wb = XLSX.utils.book_new();
  const d = (d: Date | null) => d ? new Date(d).toLocaleDateString("ru-RU") : "—";

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Наименование", "Категория", "Ед.", "Остаток", "Цена (сом)", "Сумма (сом)"],
    ...stockRows.map((r) => [r.name, r.category ?? "—", r.unit, Number(r.currentStock), Number(r.pricePerUnit), Number(r.totalValue)]),
  ]), "Остатки");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Дата", "Позиция", "Ед.", "Кол-во", "Цена", "Сумма", "Поставщик"],
    ...receiptRows.map((r) => [d(r.createdAt), r.itemName ?? "—", r.unit ?? "", Number(r.quantity), Number(r.pricePerUnit), Number(r.totalCost), r.supplier ?? "—"]),
  ]), "Поступления");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Дата", "Позиция", "Ед.", "Кол-во", "Сумма", "Причина", "Сотрудник"],
    ...writeOffRows.map((r) => [d(r.createdAt), r.itemName ?? "—", r.unit ?? "", Number(r.quantity), Number(r.totalValue), r.reason ?? "—", r.staffName ?? "—"]),
  ]), "Списания");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

async function sendTextReport(ctx: Context & { chat: { id: number } }, categoryId?: number) {
  const { from, to } = getMonthRange();
  const label = to.toLocaleString("ru-RU", { month: "long", year: "numeric" });

  const stockCond = categoryId ? [eq(itemsTable.categoryId, categoryId)] : [];
  const stockRows = await db
    .select({
      name: itemsTable.name,
      unit: itemsTable.unit,
      currentStock: itemsTable.currentStock,
      totalValue: sql<string>`CAST(${itemsTable.currentStock} AS DECIMAL) * CAST(${itemsTable.pricePerUnit} AS DECIMAL)`,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(stockCond.length ? and(...stockCond) : undefined)
    .orderBy(itemsTable.name);

  const woCond: ReturnType<typeof gte>[] = [gte(writeOffsTable.createdAt, from), lte(writeOffsTable.createdAt, to)];
  if (categoryId) woCond.push(eq(itemsTable.categoryId, categoryId) as ReturnType<typeof gte>);
  const woRows = await db
    .select({ totalValue: writeOffsTable.totalValue })
    .from(writeOffsTable)
    .leftJoin(itemsTable, eq(writeOffsTable.itemId, itemsTable.id))
    .where(and(...woCond));

  const rcCond: ReturnType<typeof gte>[] = [gte(receiptsTable.createdAt, from), lte(receiptsTable.createdAt, to)];
  if (categoryId) rcCond.push(eq(itemsTable.categoryId, categoryId) as ReturnType<typeof gte>);
  const rcRows = await db
    .select({ totalCost: receiptsTable.totalCost })
    .from(receiptsTable)
    .leftJoin(itemsTable, eq(receiptsTable.itemId, itemsTable.id))
    .where(and(...rcCond));

  const totalStock = stockRows.reduce((s, r) => s + Number(r.totalValue), 0);
  const totalWo = woRows.reduce((s, r) => s + Number(r.totalValue), 0);
  const totalRc = rcRows.reduce((s, r) => s + Number(r.totalCost), 0);

  const lines = stockRows.slice(0, 20).map((r) =>
    `• ${r.name}: ${Number(r.currentStock).toFixed(1)} ${r.unit}`
  );
  if (stockRows.length > 20) lines.push(`...и ещё ${stockRows.length - 20} позиций`);

  await ctx.reply(
    `📄 *Отчёт за ${label}*\n\n` +
    `*Стоимость склада:* ${fmt(totalStock)} сом\n` +
    `*Поступлений:* ${fmt(totalRc)} сом\n` +
    `*Списаний:* ${fmt(totalWo)} сом\n\n` +
    `*Остатки:*\n${lines.join("\n")}`,
    { parse_mode: "Markdown" }
  );
}

// ---------------------------------------------------------------------------
// Show item selector for breakage
// ---------------------------------------------------------------------------
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
    await ctx.reply("📋 *Выберите позицию для списания:*", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: items.map((it) => [
          { text: `${it.name} (${it.unit})`, callback_data: `item_${it.id}` },
        ]),
      },
    });
  } catch (err) {
    logger.error({ err }, "Telegram showItemSelector error");
    await ctx.reply("Произошла ошибка. Попробуйте снова.");
  }
}

// ---------------------------------------------------------------------------
// Bot init
// ---------------------------------------------------------------------------
export function initTelegramBot(): import("express").RequestHandler | undefined {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.info("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return undefined;
  }

  bot = new Telegraf(token);

  // ---- /start ----
  bot.start(async (ctx) => {
    states.delete(ctx.chat.id);
    await showMainMenu(ctx as Parameters<typeof showMainMenu>[0]);
  });

  // ---- /menu ----
  bot.command("menu", async (ctx) => {
    states.delete(ctx.chat.id);
    authStates.delete(ctx.chat.id);
    await showMainMenu(ctx as Parameters<typeof showMainMenu>[0]);
  });

  // ---- /myid ----
  bot.command("myid", async (ctx) => {
    await ctx.reply(`Ваш Telegram Chat ID: \`${ctx.chat.id}\``, { parse_mode: "Markdown" });
  });

  // ---- /cancel ----
  bot.command("cancel", (ctx) => {
    states.delete(ctx.chat.id);
    authStates.delete(ctx.chat.id);
    ctx.reply("Операция отменена. Отправьте /menu для начала.");
  });

  // ---- Profile ----
  bot.action("show_profile", async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const user = await getUserByChat(chatId);
    if (!user) {
      await ctx.reply("Аккаунт не привязан. Отправьте /start для входа.");
      return;
    }
    await ctx.reply(
      `👤 *Профиль*\n\nEmail: ${user.email}\nРоль: *${getRoleLabel(user.role)}*\nChat ID: \`${chatId}\``,
      { parse_mode: "Markdown" }
    );
  });

  // ---- Stock ----
  bot.action("show_stock", async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const items = await db
        .select({
          name: itemsTable.name,
          currentStock: itemsTable.currentStock,
          unit: itemsTable.unit,
          minThreshold: itemsTable.minThreshold,
          category: categoriesTable.name,
        })
        .from(itemsTable)
        .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
        .orderBy(categoriesTable.name, itemsTable.name)
        .limit(30);

      if (!items.length) {
        await ctx.reply("Позиций на складе нет.");
        return;
      }

      const lines = items.map((it) => {
        const stock = Number(it.currentStock).toFixed(1);
        const warn = it.minThreshold && Number(it.currentStock) <= Number(it.minThreshold) ? " ⚠️" : "";
        const cat = it.category ? `[${it.category}] ` : "";
        return `• ${cat}*${it.name}*: ${stock} ${it.unit}${warn}`;
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

  // ---- Critical stock ----
  bot.action("show_critical", async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const role = await getUserRole(ctx.chat!.id);
      if (role !== "admin") {
        await ctx.reply("⛔ Нет доступа.");
        return;
      }
      const items = await db
        .select({
          name: itemsTable.name,
          currentStock: itemsTable.currentStock,
          minThreshold: itemsTable.minThreshold,
          unit: itemsTable.unit,
        })
        .from(itemsTable)
        .where(
          and(
            sql`${itemsTable.minThreshold} IS NOT NULL`,
            sql`CAST(${itemsTable.currentStock} AS DECIMAL) <= CAST(${itemsTable.minThreshold} AS DECIMAL)`,
          )
        )
        .orderBy(itemsTable.name);

      if (!items.length) {
        await ctx.reply("✅ Всё в норме — критически низких остатков нет.");
        return;
      }

      const lines = items.map((it) =>
        `🔴 *${it.name}*: ${Number(it.currentStock).toFixed(1)} ${it.unit} (мин: ${Number(it.minThreshold).toFixed(1)})`
      );

      await ctx.reply(
        `⚠️ *Критический остаток — нужно купить*\n\n${lines.join("\n")}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      logger.error({ err }, "show_critical error");
      await ctx.reply("Ошибка при получении данных.");
    }
  });

  // ---- Report: pick category ----
  bot.action("report_pick_cat", async (ctx) => {
    await ctx.answerCbQuery();
    const role = await getUserRole(ctx.chat!.id);
    if (!role || !["admin", "manager", "accountant"].includes(role)) {
      await ctx.reply("⛔ Нет доступа.");
      return;
    }
    try {
      const cats = await db
        .select({ id: categoriesTable.id, name: categoriesTable.name })
        .from(categoriesTable)
        .orderBy(categoriesTable.name);

      const keyboard: Array<Array<{ text: string; callback_data: string }>> = [
        [{ text: "📋 Все категории", callback_data: "rep_fmt_all" }],
        ...cats.map((c) => [{ text: c.name, callback_data: `rep_fmt_${c.id}` }]),
      ];

      await ctx.reply("📊 *Выберите категорию для отчёта:*\n_(за текущий месяц)_", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      logger.error({ err }, "report_pick_cat error");
      await ctx.reply("Ошибка загрузки категорий.");
    }
  });

  // ---- Report: pick format ----
  bot.action(/^rep_fmt_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Выберите формат");
    const catRaw = ctx.match[1];
    const catId = catRaw === "all" ? undefined : Number(catRaw);

    let catName = "Все категории";
    if (catId) {
      const cat = await db.query.categoriesTable.findFirst({ where: eq(categoriesTable.id, catId) });
      catName = cat?.name ?? catName;
    }

    await ctx.reply(
      `*${catName}* — выберите формат:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📊 Excel файл", callback_data: `rep_xlsx_${catRaw}` },
              { text: "📄 Текстовый", callback_data: `rep_txt_${catRaw}` },
            ],
          ],
        },
      }
    );
  });

  // ---- Report: send xlsx ----
  bot.action(/^rep_xlsx_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Генерирую Excel...");
    const catRaw = ctx.match[1];
    const catId = catRaw === "all" ? undefined : Number(catRaw);

    let catName = "all";
    if (catId) {
      const cat = await db.query.categoriesTable.findFirst({ where: eq(categoriesTable.id, catId) });
      catName = cat?.name ?? catName;
    }

    try {
      await ctx.reply("⏳ Генерирую отчёт...");
      const buf = await generateReportXlsx(catId);
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const filename = `msklad-${catName.replace(/\s+/g, "_")}-${month}.xlsx`;

      await ctx.replyWithDocument({
        source: buf,
        filename,
      }, {
        caption: `📊 Отчёт за ${now.toLocaleString("ru-RU", { month: "long", year: "numeric" })}${catId ? ` — ${catName}` : ""}`,
      });
    } catch (err) {
      logger.error({ err }, "rep_xlsx error");
      await ctx.reply("Ошибка при генерации отчёта. Попробуйте позже.");
    }
  });

  // ---- Report: send text ----
  bot.action(/^rep_txt_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Формирую отчёт...");
    const catRaw = ctx.match[1];
    const catId = catRaw === "all" ? undefined : Number(catRaw);

    try {
      await sendTextReport(ctx as Parameters<typeof sendTextReport>[0], catId);
    } catch (err) {
      logger.error({ err }, "rep_txt error");
      await ctx.reply("Ошибка при формировании отчёта.");
    }
  });

  // ---- Rentals ----
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

  // ---- Breakage flow ----
  bot.action("start_breakage", async (ctx) => {
    await ctx.answerCbQuery();
    const role = await getUserRole(ctx.chat!.id);
    if (role !== "admin" && role !== "manager") {
      await ctx.reply("⛔ У вас нет прав для регистрации списания.");
      return;
    }
    await showItemSelector(ctx as Parameters<typeof showItemSelector>[0]);
  });

  bot.action(/^item_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const itemId = Number(ctx.match[1]);
    try {
      const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, itemId) });
      if (!item) { await ctx.reply("Позиция не найдена."); return; }
      states.set(chatId, { step: "await_qty", itemId: item.id, itemName: item.name, itemUnit: item.unit });
      await ctx.reply(`Позиция: *${item.name}*\n\nВведите количество:`, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error({ err }, "Telegram item select error");
      await ctx.reply("Ошибка. Попробуйте снова.");
    }
  });

  bot.action(/^reason_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const state = states.get(chatId);
    if (!state || state.step !== "await_reason") {
      await ctx.reply("Сессия устарела. Начните заново с /menu");
      return;
    }

    const idx = Number(ctx.match[1]);
    if (idx < 0 || idx >= REASONS.length) { await ctx.reply("Неверный выбор."); return; }

    const reason = REASONS[idx];
    const { itemId, itemName, itemUnit, qty } = state;
    states.delete(chatId);

    if (!itemId || !qty) { await ctx.reply("Ошибка сессии. Начните заново."); return; }

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
        `✅ Списание зарегистрировано:\n\n*${itemName}* — ${qty} ${itemUnit ?? "ед."}\nПричина: ${reason}\nСумма: ${fmt(totalValue)} сом`,
        { parse_mode: "Markdown" }
      );

      // Notify all other admins about this bot-initiated write-off
      const user = await getUserByChat(chatId);
      void sendWriteOffNotification({
        itemName: itemName ?? "—",
        unit: itemUnit ?? "ед.",
        quantity: qty,
        reason,
        totalValue,
        recordedByName: user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : "Telegram-бот",
        excludeChatId: chatId,
      });

      const [updated] = await db
        .select({ currentStock: itemsTable.currentStock, minThreshold: itemsTable.minThreshold })
        .from(itemsTable)
        .where(eq(itemsTable.id, itemId));

      if (updated?.minThreshold && Number(updated.currentStock) <= Number(updated.minThreshold)) {
        await sendLowStockAlert(itemName ?? "—", Number(updated.currentStock), Number(updated.minThreshold), item?.unit ?? "ед.");
      }
    } catch (err) {
      logger.error({ err }, "Telegram breakage write-off error");
      await ctx.reply("Ошибка при сохранении. Попробуйте снова.");
    }
  });

  bot.action("cancel", async (ctx) => {
    await ctx.answerCbQuery("Отменено");
    states.delete(ctx.chat!.id);
    authStates.delete(ctx.chat!.id);
    await ctx.reply("Операция отменена. Отправьте /menu для начала.");
  });

  // ---- Text handler (auth + breakage qty) ----
  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    // Skip commands
    if (text.startsWith("/")) return;

    // ---- Auth: awaiting email ----
    const authState = authStates.get(chatId);
    if (authState?.step === "await_email") {
      const email = text.toLowerCase();
      try {
        const user = await db.query.usersTable.findFirst({
          where: eq(usersTable.email, email),
        });
        if (!user) {
          await ctx.reply(
            "❌ Email не найден в системе.\n\nПроверьте написание или обратитесь к администратору.\nПовторите ввод:"
          );
          return;
        }
        // Link this chat ID
        await db
          .update(usersTable)
          .set({ telegramChatId: String(chatId) })
          .where(eq(usersTable.id, user.id));

        authStates.delete(chatId);
        await ctx.reply(
          `✅ Вы успешно вошли как *${user.firstName ?? user.email}* (${getRoleLabel(user.role)})`,
          { parse_mode: "Markdown" }
        );
        await showMainMenu(ctx as Parameters<typeof showMainMenu>[0]);
      } catch (err) {
        logger.error({ err }, "Telegram email auth error");
        await ctx.reply("Ошибка авторизации. Попробуйте позже или отправьте /start.");
      }
      return;
    }

    // ---- Breakage: awaiting quantity ----
    const state = states.get(chatId);
    if (!state || state.step !== "await_qty") return;

    const qty = Number(text.replace(",", "."));
    if (isNaN(qty) || qty <= 0) {
      await ctx.reply("Введите положительное число.");
      return;
    }

    states.set(chatId, { ...state, step: "await_reason", qty });
    await ctx.reply(`Количество: *${qty}*\n\nВыберите причину:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: REASONS.map((r, i) => [{ text: r, callback_data: `reason_${i}` }]),
      },
    });
  });

  const devDomain = process.env["REPLIT_DEV_DOMAIN"];

  if (devDomain) {
    // Webhook mode — avoids node-fetch AbortSignal incompatibility with Node 18+
    const webhookPath = `/bot${token.slice(-12)}`;
    const webhookUrl = `https://${devDomain}/api${webhookPath}`;

    bot.telegram
      .setWebhook(webhookUrl)
      .then(() => {
        logger.info({ url: webhookUrl }, "Telegram webhook registered");
        void checkOverdueRentals();
        setInterval(() => { void checkOverdueRentals(); }, 60 * 60 * 1000);
      })
      .catch((err) => logger.error({ err }, "Failed to set Telegram webhook"));

    return bot.webhookCallback(webhookPath);
  }

  // Fallback: polling (for local dev without REPLIT_DEV_DOMAIN)
  bot
    .launch()
    .then(() => {
      logger.info("Telegram bot started (polling)");
      void checkOverdueRentals();
      setInterval(() => { void checkOverdueRentals(); }, 60 * 60 * 1000);
    })
    .catch((err) => logger.error({ err }, "Failed to start Telegram bot (polling)"));

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  return undefined;
}

// ---------------------------------------------------------------------------
// Exported notification helpers
// ---------------------------------------------------------------------------

export async function sendWriteOffNotification(params: {
  itemName: string;
  unit: string;
  quantity: number;
  reason: string;
  totalValue: number;
  staffName?: string | null;
  recordedByName?: string | null;
  excludeChatId?: number;
}): Promise<void> {
  if (!bot) return;
  try {
    const admins = await db
      .select({ telegramChatId: usersTable.telegramChatId, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    const who = params.staffName || params.recordedByName || "Неизвестно";
    const text =
      `📝 *Новое списание*\n\n` +
      `*Позиция:* ${params.itemName}\n` +
      `*Количество:* ${params.quantity} ${params.unit}\n` +
      `*Сумма:* ${fmt(params.totalValue)} сом\n` +
      `*Причина:* ${params.reason}\n` +
      `*Кто:* ${who}\n` +
      `*Время:* ${new Date().toLocaleString("ru-RU")}`;

    for (const admin of admins) {
      if (!admin.telegramChatId) continue;
      const cid = Number(admin.telegramChatId);
      if (params.excludeChatId && cid === params.excludeChatId) continue;
      await bot.telegram.sendMessage(cid, text, { parse_mode: "Markdown" });
    }
  } catch (err) {
    logger.error({ err }, "sendWriteOffNotification error");
  }
}

export async function sendLowStockAlert(
  itemName: string,
  currentStock: number,
  minThreshold: number,
  unit: string
): Promise<void> {
  if (!bot) return;
  try {
    const admins = await db
      .select({ telegramChatId: usersTable.telegramChatId })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    const text =
      `⚠️ *Низкий остаток*\n\n*${itemName}*: ${currentStock} ${unit}\nМинимум: ${minThreshold} ${unit}\n\nПроверьте запасы в M-Sklad.`;

    for (const admin of admins) {
      if (!admin.telegramChatId) continue;
      await bot.telegram.sendMessage(Number(admin.telegramChatId), text, { parse_mode: "Markdown" });
    }
  } catch (err) {
    logger.error({ err }, "sendLowStockAlert error");
  }
}

export async function sendOverdueRentalAlert(
  itemName: string,
  renterName: string,
  renterPhone: string | null,
  plannedReturnAt: Date,
  quantity: number,
  itemUnit: string
): Promise<void> {
  if (!bot) return;
  try {
    const admins = await db
      .select({ telegramChatId: usersTable.telegramChatId })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    const dateStr = plannedReturnAt.toLocaleDateString("ru-RU");
    const phone = renterPhone ? `\nТелефон: ${renterPhone}` : "";
    const text =
      `🔴 *Просрочена аренда*\n\n*Товар:* ${itemName} × ${quantity} ${itemUnit}\n*Арендатор:* ${renterName}${phone}\n*Планируемый возврат:* ${dateStr}`;

    for (const admin of admins) {
      if (!admin.telegramChatId) continue;
      await bot.telegram.sendMessage(Number(admin.telegramChatId), text, { parse_mode: "Markdown" });
    }
  } catch (err) {
    logger.error({ err }, "sendOverdueRentalAlert error");
  }
}

async function checkOverdueRentals(): Promise<void> {
  if (!bot) return;
  try {
    const now = new Date();
    const overdueRentals = await db
      .select({
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
    logger.error({ err }, "checkOverdueRentals error");
  }
}
