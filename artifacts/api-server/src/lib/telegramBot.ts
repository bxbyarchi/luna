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
import { eq, sql, and, lt, lte, gte, ilike } from "drizzle-orm";
import * as XLSX from "xlsx";
import { logger } from "./logger";
import { logAudit } from "./auditLogger";

// ============================================================================
// Button text constants — used for ReplyKeyboard matching
// ============================================================================
const BTN = {
  // Main menu
  ANALYTICS:  "📊 Аналитика и Отчёты",
  WAREHOUSE:  "📦 Управление Складом",
  SETTINGS:   "⚙️ Настройки и Доступы",
  PROFILE:    "👤 Профиль",
  // Warehouse submenu
  ALL_STOCK:  "📦 Все остатки",
  SEARCH:     "🔍 Поиск товара",
  CRITICAL:   "⚠️ Критический остаток",
  BREAKAGE:   "📸 Новое списание",
  // Universal
  BACK:       "⬅️ Назад в меню",
} as const;

const REASONS = [
  "Бой/повреждение",
  "Порча",
  "Хищение",
  "Естественная убыль",
  "Списание по акту",
  "Хозяйственные нужды",
  "Иное",
];

// ============================================================================
// Unified state machine
// ============================================================================
type CtxMode =
  | "main"
  | "warehouse"
  | "analytics"
  | "auth"
  | "search"
  | "breakage_qty"
  | "breakage_reason"
  | "restock_qty";

interface UserCtx {
  mode: CtxMode;
  itemId?: number;
  itemName?: string;
  itemUnit?: string;
  qty?: number;
}

const userCtx = new Map<number, UserCtx>();

let bot: Telegraf | null = null;

// ============================================================================
// DB helpers
// ============================================================================
async function getUserByChat(chatId: number) {
  try {
    return await db.query.usersTable.findFirst({
      where: eq(usersTable.telegramChatId, String(chatId)),
    });
  } catch { return null; }
}

async function getUserRole(chatId: number): Promise<string | null> {
  const u = await getUserByChat(chatId);
  return u?.role ?? null;
}

function roleLabel(role: string) {
  return ({ admin: "Завхоз", manager: "Управляющий", accountant: "Бухгалтер", warehouse: "Кладовщик" } as Record<string, string>)[role] ?? role;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// Keyboard builders
// ============================================================================
function mainKeyboard(role: string) {
  const isAdmin = role === "admin";
  const rows: Array<Array<{ text: string }>> = [
    [{ text: BTN.ANALYTICS }, { text: BTN.WAREHOUSE }],
  ];
  if (isAdmin) rows.push([{ text: BTN.SETTINGS }, { text: BTN.PROFILE }]);
  else rows.push([{ text: BTN.PROFILE }]);
  return { keyboard: rows, resize_keyboard: true };
}

function warehouseKeyboard(role: string) {
  const isAdmin = role === "admin";
  const rows: Array<Array<{ text: string }>> = [
    [{ text: BTN.ALL_STOCK }, { text: BTN.SEARCH }],
    [{ text: BTN.CRITICAL }],
  ];
  if (isAdmin) rows.push([{ text: BTN.BREAKAGE }]);
  rows.push([{ text: BTN.BACK }]);
  return { keyboard: rows, resize_keyboard: true };
}

// ============================================================================
// Send menus
// ============================================================================
async function sendMainMenu(ctx: Context & { chat: { id: number } }, user: NonNullable<Awaited<ReturnType<typeof getUserByChat>>>) {
  const role = user.role;
  userCtx.set(ctx.chat.id, { mode: "main" });
  await ctx.reply(
    `🏪 *M-Sklad — Главное меню*\n\nДобро пожаловать, *${user.firstName ?? user.email}* (${roleLabel(role)})\n\nВыберите раздел:`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard(role) }
  );
}

async function sendWarehouseMenu(ctx: Context & { chat: { id: number } }, role: string) {
  userCtx.set(ctx.chat.id, { mode: "warehouse" });
  await ctx.reply(
    "📦 *Управление Складом*\n\nВыберите действие:",
    { parse_mode: "Markdown", reply_markup: warehouseKeyboard(role) }
  );
}

async function requireAuth(ctx: Context & { chat: { id: number } }) {
  const user = await getUserByChat(ctx.chat.id);
  if (!user) {
    userCtx.set(ctx.chat.id, { mode: "auth" });
    await ctx.reply(
      "👋 Добро пожаловать в *M-Sklad*!\n\nДля входа введите ваш рабочий Email:",
      { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
    );
    return null;
  }
  return user;
}

// ============================================================================
// Analytics — inline category + format pickers
// ============================================================================
async function sendAnalyticsMenu(ctx: Context) {
  try {
    const cats = await db
      .select({ id: categoriesTable.id, name: categoriesTable.name })
      .from(categoriesTable)
      .orderBy(categoriesTable.name);

    const catRows = cats.map((c) => [{ text: c.name, callback_data: `rep_fmt_${c.id}` }]);
    await ctx.reply(
      "📊 *Аналитика и Отчёты*\n_(за текущий месяц)_\n\nВыберите категорию:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Общий отчёт (все категории)", callback_data: "rep_fmt_all" }],
            ...catRows,
          ],
        },
      }
    );
  } catch (err) {
    logger.error({ err }, "sendAnalyticsMenu error");
    await ctx.reply("Ошибка загрузки категорий.");
  }
}

// ============================================================================
// Stock display
// ============================================================================
async function showAllStock(ctx: Context & { chat: { id: number } }) {
  try {
    const items = await db
      .select({
        id: itemsTable.id,
        name: itemsTable.name,
        currentStock: itemsTable.currentStock,
        unit: itemsTable.unit,
        minThreshold: itemsTable.minThreshold,
        category: categoriesTable.name,
      })
      .from(itemsTable)
      .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
      .orderBy(categoriesTable.name, itemsTable.name)
      .limit(35);

    if (!items.length) { await ctx.reply("Позиций на складе нет."); return; }

    const lines = items.map((it) => {
      const stock = Number(it.currentStock);
      const min = it.minThreshold ? Number(it.minThreshold) : null;
      const isCritical = min !== null && stock <= min;
      const icon = isCritical ? "🔴" : stock > (min ?? 0) * 2 ? "🟢" : "🟡";
      const cat = it.category ? `[${it.category}] ` : "";
      return `${icon} ${cat}*${it.name}*: ${stock.toFixed(1)} ${it.unit}${isCritical ? " ⚠️" : ""}`;
    });

    await ctx.reply(
      `📦 *Остатки на складе* (${items.length} позиций)\n\n${lines.join("\n")}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error({ err }, "showAllStock error");
    await ctx.reply("Ошибка при получении данных.");
  }
}

async function showCriticalStock(ctx: Context) {
  try {
    const items = await db
      .select({
        id: itemsTable.id,
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
      await ctx.reply("✅ *Всё в норме!*\n\nКритически низких остатков нет.", { parse_mode: "Markdown" });
      return;
    }

    const lines = items.map((it) => {
      const stock = Number(it.currentStock).toFixed(1);
      const min = Number(it.minThreshold).toFixed(1);
      return `⚠️ *${it.name}*\nОстаток: *${stock} ${it.unit}* (мин: ${min})`;
    });

    await ctx.reply(
      `🚨 *КРИТИЧЕСКИЙ ОСТАТОК — нужно купить!*\n\n${lines.join("\n\n")}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error({ err }, "showCriticalStock error");
    await ctx.reply("Ошибка при получении данных.");
  }
}

async function showItemDetail(ctx: Context, itemId: number, role: string) {
  try {
    const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, itemId) });
    if (!item) { await ctx.reply("Товар не найден."); return; }

    const stock = Number(item.currentStock);
    const min = item.minThreshold ? Number(item.minThreshold) : null;
    const isCritical = min !== null && stock <= min;
    const icon = isCritical ? "🔴" : "🟢";

    let text = `${icon} *${item.name}*\n\n`;
    text += `📦 Остаток: *${stock.toFixed(2)} ${item.unit}*\n`;
    text += `💰 Цена: ${fmt(Number(item.pricePerUnit))} сом/${item.unit}\n`;
    text += `💵 Стоимость: *${fmt(stock * Number(item.pricePerUnit))} сом*\n`;
    if (min !== null) text += `\n🎯 Минимум: ${min.toFixed(1)} ${item.unit}`;
    if (isCritical) text += `\n\n⚠️ *КРИТИЧЕСКИЙ ОСТАТОК!*`;

    const isAdmin = role === "admin";
    const canWrite = role === "admin" || role === "manager";

    const inlineButtons: Array<Array<{ text: string; callback_data: string }>> = [];
    if (canWrite) {
      inlineButtons.push([
        { text: `📉 Списать ${item.name}`, callback_data: `wo_start_${item.id}` },
      ]);
    }
    if (isAdmin) {
      inlineButtons.push([
        { text: `📥 Пополнить ${item.name}`, callback_data: `rs_start_${item.id}` },
      ]);
    }

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: inlineButtons.length ? { inline_keyboard: inlineButtons } : undefined,
    });
  } catch (err) {
    logger.error({ err }, "showItemDetail error");
    await ctx.reply("Ошибка при получении данных.");
  }
}

// ============================================================================
// Search
// ============================================================================
async function handleSearch(ctx: Context & { chat: { id: number } }, query: string, role: string) {
  try {
    const items = await db
      .select({
        id: itemsTable.id,
        name: itemsTable.name,
        currentStock: itemsTable.currentStock,
        unit: itemsTable.unit,
        minThreshold: itemsTable.minThreshold,
        category: categoriesTable.name,
      })
      .from(itemsTable)
      .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
      .where(ilike(itemsTable.name, `%${query}%`))
      .limit(8);

    if (!items.length) {
      await ctx.reply(
        `🔍 По запросу «${query}» ничего не найдено.\n\nПопробуйте другой запрос:`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (items.length === 1) {
      userCtx.set(ctx.chat.id, { mode: "warehouse" });
      await showItemDetail(ctx, items[0].id, role);
      return;
    }

    const keyboard = items.map((it) => {
      const stock = Number(it.currentStock);
      const min = it.minThreshold ? Number(it.minThreshold) : null;
      const warn = min !== null && stock <= min ? " ⚠️" : "";
      const label = `${it.name} — ${stock.toFixed(1)} ${it.unit}${warn}`;
      return [{ text: label, callback_data: `item_detail_${it.id}` }];
    });

    await ctx.reply(
      `🔍 Найдено *${items.length}* позиций по «${query}»:\n\nВыберите товар для просмотра:`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      }
    );
    userCtx.set(ctx.chat.id, { mode: "warehouse" });
  } catch (err) {
    logger.error({ err }, "handleSearch error");
    await ctx.reply("Ошибка при поиске.");
  }
}

// ============================================================================
// Settings (admin only)
// ============================================================================
async function showSettings(ctx: Context & { chat: { id: number } }) {
  try {
    const users = await db
      .select({
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        role: usersTable.role,
        telegramChatId: usersTable.telegramChatId,
      })
      .from(usersTable)
      .orderBy(usersTable.role);

    const lines = users.map((u) => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
      const tg = u.telegramChatId ? "✅" : "❌";
      return `${tg} *${name}* — ${roleLabel(u.role)}`;
    });

    await ctx.reply(
      `⚙️ *Настройки и Доступы*\n\n*Пользователи системы:*\n${lines.join("\n")}\n\n✅ — Telegram привязан\n❌ — Telegram не привязан\n\n📋 *Команды:*\n/logout — сменить аккаунт (отвязать Telegram)\n/myid — узнать свой Chat ID\n\nДля управления ролями и пользователями используйте веб-интерфейс → Настройки`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error({ err }, "showSettings error");
    await ctx.reply("Ошибка загрузки данных.");
  }
}

// ============================================================================
// Report generation
// ============================================================================
function getMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { from, to };
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

  const d = (dt: Date | null) => dt ? new Date(dt).toLocaleDateString("ru-RU") : "—";
  const wb = XLSX.utils.book_new();

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

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function sendTextReport(ctx: Context, categoryId?: number) {
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

  const lines = stockRows.slice(0, 20).map((r) => `• ${r.name}: ${Number(r.currentStock).toFixed(1)} ${r.unit}`);
  if (stockRows.length > 20) lines.push(`_...и ещё ${stockRows.length - 20} позиций_`);

  await ctx.reply(
    `📄 *Отчёт за ${label}*\n\n` +
    `💰 Стоимость склада: *${fmt(totalStock)} сом*\n` +
    `📥 Поступления: ${fmt(totalRc)} сом\n` +
    `📉 Списания: ${fmt(totalWo)} сом\n\n` +
    `*Остатки:*\n${lines.join("\n")}`,
    { parse_mode: "Markdown" }
  );
}

// ============================================================================
// Write-off (breakage) helpers
// ============================================================================
async function startBreakageForItem(ctx: Context & { chat: { id: number } }, itemId: number) {
  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, itemId) });
  if (!item) { await ctx.reply("Товар не найден."); return; }
  userCtx.set(ctx.chat.id, { mode: "breakage_qty", itemId: item.id, itemName: item.name, itemUnit: item.unit });
  await ctx.reply(
    `📉 *Списание: ${item.name}*\n\nТекущий остаток: *${Number(item.currentStock).toFixed(2)} ${item.unit}*\n\nВведите количество для списания:`,
    { parse_mode: "Markdown" }
  );
}

async function startBreakageFlow(ctx: Context & { chat: { id: number } }) {
  try {
    const items = await db
      .select({ id: itemsTable.id, name: itemsTable.name, unit: itemsTable.unit, currentStock: itemsTable.currentStock })
      .from(itemsTable)
      .orderBy(itemsTable.name)
      .limit(25);

    if (!items.length) { await ctx.reply("В базе нет позиций."); return; }

    const keyboard = items.map((it) => [
      { text: `${it.name} — ${Number(it.currentStock).toFixed(1)} ${it.unit}`, callback_data: `item_${it.id}` },
    ]);
    keyboard.push([{ text: "❌ Отмена", callback_data: "cancel" }]);

    await ctx.reply("📋 *Выберите позицию для списания:*", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    logger.error({ err }, "startBreakageFlow error");
    await ctx.reply("Ошибка загрузки товаров.");
  }
}

// ============================================================================
// Restock (receipt creation) helpers
// ============================================================================
async function startRestockForItem(ctx: Context & { chat: { id: number } }, itemId: number) {
  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, itemId) });
  if (!item) { await ctx.reply("Товар не найден."); return; }
  userCtx.set(ctx.chat.id, { mode: "restock_qty", itemId: item.id, itemName: item.name, itemUnit: item.unit });
  await ctx.reply(
    `📥 *Пополнение: ${item.name}*\n\nТекущий остаток: *${Number(item.currentStock).toFixed(2)} ${item.unit}*\nЦена: ${fmt(Number(item.pricePerUnit))} сом/${item.unit}\n\nВведите количество для пополнения:`,
    { parse_mode: "Markdown" }
  );
}

// ============================================================================
// Bot init
// ============================================================================
export function initTelegramBot(): import("express").RequestHandler | undefined {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.info("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return undefined;
  }

  bot = new Telegraf(token);

  // ---- /start and /menu ----
  async function handleStart(ctx: Context & { chat: { id: number } }) {
    userCtx.set(ctx.chat.id, { mode: "main" });
    const user = await requireAuth(ctx);
    if (!user) return;
    await sendMainMenu(ctx, user);
  }

  bot.start(handleStart);
  bot.command("menu", handleStart);

  bot.command("myid", async (ctx) => {
    await ctx.reply(`🪪 Ваш Chat ID: \`${ctx.chat.id}\``, { parse_mode: "Markdown" });
  });

  bot.command("cancel", async (ctx) => {
    userCtx.delete(ctx.chat.id);
    const user = await getUserByChat(ctx.chat.id);
    if (user) {
      userCtx.set(ctx.chat.id, { mode: "main" });
      await ctx.reply("✅ Операция отменена.", {
        reply_markup: mainKeyboard(user.role),
      });
    } else {
      await ctx.reply("Операция отменена. Введите /start для начала.");
    }
  });

  bot.command("logout", async (ctx) => {
    const chatId = ctx.chat.id;
    try {
      const user = await getUserByChat(chatId);
      if (!user) {
        await ctx.reply("Вы и так не авторизованы. Отправьте /start для входа.", {
          reply_markup: { remove_keyboard: true },
        });
        return;
      }
      await db
        .update(usersTable)
        .set({ telegramChatId: null })
        .where(eq(usersTable.id, user.id));
      userCtx.delete(chatId);
      await ctx.reply(
        `👋 Вы вышли из аккаунта *${user.firstName ?? user.email}*.\n\nДля повторного входа отправьте /start и введите Email.`,
        { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
      );
    } catch (err) {
      logger.error({ err }, "Telegram logout error");
      await ctx.reply("Ошибка при выходе. Попробуйте снова.");
    }
  });

  // ---- Analytics inline actions ----
  bot.action(/^rep_fmt_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const catRaw = ctx.match[1];
    const catId = catRaw === "all" ? undefined : Number(catRaw);

    let catName = "Все категории";
    if (catId) {
      const cat = await db.query.categoriesTable.findFirst({ where: eq(categoriesTable.id, catId) });
      catName = cat?.name ?? catName;
    }

    await ctx.reply(
      `📊 *${catName}* — выберите формат:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "📊 Excel файл", callback_data: `rep_xlsx_${catRaw}` },
            { text: "📄 Текстовый", callback_data: `rep_txt_${catRaw}` },
          ]],
        },
      }
    );
  });

  bot.action(/^rep_xlsx_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Генерирую Excel…");
    const catRaw = ctx.match[1];
    const catId = catRaw === "all" ? undefined : Number(catRaw);
    let catName = "all";
    if (catId) {
      const cat = await db.query.categoriesTable.findFirst({ where: eq(categoriesTable.id, catId) });
      catName = cat?.name ?? catName;
    }
    try {
      await ctx.reply("⏳ Генерирую отчёт, подождите...");
      const buf = await generateReportXlsx(catId);
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await ctx.replyWithDocument(
        { source: buf, filename: `msklad-${catName.replace(/\s+/g, "_")}-${month}.xlsx` },
        { caption: `📊 Отчёт за ${now.toLocaleString("ru-RU", { month: "long", year: "numeric" })}${catId ? ` — ${catName}` : ""}` }
      );
    } catch (err) {
      logger.error({ err }, "rep_xlsx error");
      await ctx.reply("Ошибка при генерации. Попробуйте позже.");
    }
  });

  bot.action(/^rep_txt_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("Формирую отчёт…");
    const catRaw = ctx.match[1];
    const catId = catRaw === "all" ? undefined : Number(catRaw);
    try {
      await sendTextReport(ctx, catId);
    } catch (err) {
      logger.error({ err }, "rep_txt error");
      await ctx.reply("Ошибка при формировании.");
    }
  });

  // ---- Stock item detail (from search results) ----
  bot.action(/^item_detail_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const role = await getUserRole(chatId) ?? "warehouse";
    await showItemDetail(ctx, Number(ctx.match[1]), role);
  });

  // ---- Write-off: item selected from list ----
  bot.action(/^item_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await startBreakageForItem(ctx as Parameters<typeof startBreakageForItem>[0], Number(ctx.match[1]));
  });

  // ---- Write-off: started from item detail inline button ----
  bot.action(/^wo_start_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const role = await getUserRole(ctx.chat!.id);
    if (role !== "admin" && role !== "manager") {
      await ctx.reply("⛔ Нет прав для списания.");
      return;
    }
    await startBreakageForItem(ctx as Parameters<typeof startBreakageForItem>[0], Number(ctx.match[1]));
  });

  // ---- Restock: started from item detail inline button ----
  bot.action(/^rs_start_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const role = await getUserRole(ctx.chat!.id);
    if (role !== "admin") {
      await ctx.reply("⛔ Только Завхоз может пополнять склад.");
      return;
    }
    await startRestockForItem(ctx as Parameters<typeof startRestockForItem>[0], Number(ctx.match[1]));
  });

  // ---- Write-off: reason selected ----
  bot.action(/^reason_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const ctx2 = userCtx.get(chatId);
    if (!ctx2 || ctx2.mode !== "breakage_reason" || !ctx2.itemId || !ctx2.qty) {
      await ctx.reply("Сессия устарела. Начните заново.");
      return;
    }

    const idx = Number(ctx.match[1]);
    if (idx < 0 || idx >= REASONS.length) { await ctx.reply("Неверный выбор."); return; }
    const reason = REASONS[idx];
    const { itemId, itemName, itemUnit, qty } = ctx2;
    userCtx.delete(chatId);

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
        details: `Telegram: ${itemName} × ${qty} (${reason})`,
      });

      await db
        .update(itemsTable)
        .set({ currentStock: sql`GREATEST(0, CAST(${itemsTable.currentStock} AS DECIMAL) - ${qty})` })
        .where(eq(itemsTable.id, itemId));

      const user = await getUserByChat(chatId);
      void sendWriteOffNotification({
        itemName: itemName ?? "—",
        unit: itemUnit ?? "ед.",
        quantity: qty,
        reason,
        totalValue,
        recordedByName: user ? (`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email) : "Telegram-бот",
        excludeChatId: chatId,
      });

      const [updated] = await db
        .select({ currentStock: itemsTable.currentStock, minThreshold: itemsTable.minThreshold })
        .from(itemsTable)
        .where(eq(itemsTable.id, itemId));

      await ctx.reply(
        `✅ *Списание зарегистрировано!*\n\n📦 ${itemName}\n📉 Количество: *${qty} ${itemUnit ?? "ед."}*\n💰 Сумма: *${fmt(totalValue)} сом*\n📋 Причина: ${reason}`,
        { parse_mode: "Markdown" }
      );

      if (updated?.minThreshold && Number(updated.currentStock) <= Number(updated.minThreshold)) {
        await sendLowStockAlert(itemName ?? "—", Number(updated.currentStock), Number(updated.minThreshold), item?.unit ?? "ед.");
      }

      // Return to warehouse menu
      if (user) {
        userCtx.set(chatId, { mode: "warehouse" });
        await ctx.reply("Возврат в меню склада:", { reply_markup: warehouseKeyboard(user.role) });
      }
    } catch (err) {
      logger.error({ err }, "Telegram write-off error");
      await ctx.reply("Ошибка при сохранении. Попробуйте снова.");
    }
  });

  // ---- Cancel ----
  bot.action("cancel", async (ctx) => {
    await ctx.answerCbQuery("Отменено");
    const chatId = ctx.chat!.id;
    userCtx.delete(chatId);
    const user = await getUserByChat(chatId);
    if (user) {
      userCtx.set(chatId, { mode: "main" });
      await ctx.reply("✅ Отменено. Возврат в главное меню:", { reply_markup: mainKeyboard(user.role) });
    } else {
      await ctx.reply("Отменено.");
    }
  });

  // ---- Profile ----
  bot.action("show_profile", async (ctx) => {
    await ctx.answerCbQuery();
    const chatId = ctx.chat!.id;
    const user = await getUserByChat(chatId);
    if (!user) { await ctx.reply("Аккаунт не привязан. Отправьте /start."); return; }
    await ctx.reply(
      `👤 *Профиль*\n\nEmail: ${user.email}\nРоль: *${roleLabel(user.role)}*\nChat ID: \`${chatId}\``,
      { parse_mode: "Markdown" }
    );
  });

  // ---- Rentals (active) ----
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

      if (!rentals.length) { await ctx.reply("✅ Активных аренд нет."); return; }
      const now = new Date();
      const lines = rentals.map((r) => {
        const overdue = r.plannedReturnAt < now ? " 🔴 ПРОСРОЧЕНО" : "";
        const date = r.plannedReturnAt.toLocaleDateString("ru-RU");
        return `• *${r.itemName}* × ${r.quantity} ${r.itemUnit}\n  ${r.renterName}${r.renterPhone ? ` (${r.renterPhone})` : ""} — до ${date}${overdue}`;
      });
      await ctx.reply(`🏷️ *Активные аренды* (${rentals.length}):\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error({ err }, "show_rentals error");
      await ctx.reply("Ошибка при получении данных.");
    }
  });

  // ============================== TEXT HANDLER ==============================
  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    // --- Require auth first ---
    const user = await getUserByChat(chatId);
    const ctx2 = userCtx.get(chatId);

    // Auth flow
    if (!user || ctx2?.mode === "auth") {
      const email = text.trim().toLowerCase();
      try {
        const [found] = await db
          .select()
          .from(usersTable)
          .where(sql`LOWER(${usersTable.email}) = ${email}`)
          .limit(1);
        if (!found) {
          await ctx.reply(
            `❌ Email *${email}* не найден в системе.\n\nПроверьте написание — должен совпадать с адресом в M-Sklad — и повторите ввод:`,
            { parse_mode: "Markdown" }
          );
          return;
        }
        await db.update(usersTable).set({ telegramChatId: String(chatId) }).where(eq(usersTable.id, found.id));
        userCtx.set(chatId, { mode: "main" });
        await ctx.reply(
          `✅ Вы вошли как *${found.firstName ?? found.email}* (${roleLabel(found.role)})`,
          { parse_mode: "Markdown" }
        );
        await sendMainMenu(ctx as Parameters<typeof sendMainMenu>[0], found);
      } catch (err) {
        logger.error({ err }, "Telegram email auth error");
        await ctx.reply("Ошибка авторизации. Отправьте /start.");
      }
      return;
    }

    const role = user.role;
    const isAdmin = role === "admin";
    const canWrite = isAdmin || role === "manager";

    // ---- ReplyKeyboard button routing ----
    if (text === BTN.ANALYTICS) {
      userCtx.set(chatId, { mode: "analytics" });
      await sendAnalyticsMenu(ctx);
      return;
    }

    if (text === BTN.WAREHOUSE) {
      await sendWarehouseMenu(ctx as Parameters<typeof sendWarehouseMenu>[0], role);
      return;
    }

    if (text === BTN.SETTINGS) {
      if (!isAdmin) { await ctx.reply("⛔ Только для Завхоза."); return; }
      await showSettings(ctx as Parameters<typeof showSettings>[0]);
      return;
    }

    if (text === BTN.PROFILE) {
      await ctx.reply(
        `👤 *Профиль*\n\nEmail: ${user.email}\nРоль: *${roleLabel(role)}*\nChat ID: \`${chatId}\``,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (text === BTN.BACK) {
      userCtx.set(chatId, { mode: "main" });
      await ctx.reply("🏪 Главное меню:", { reply_markup: mainKeyboard(role) });
      return;
    }

    if (text === BTN.ALL_STOCK) {
      await showAllStock(ctx as Parameters<typeof showAllStock>[0]);
      return;
    }

    if (text === BTN.CRITICAL) {
      await showCriticalStock(ctx);
      return;
    }

    if (text === BTN.BREAKAGE) {
      if (!canWrite) { await ctx.reply("⛔ Нет прав для списания."); return; }
      await startBreakageFlow(ctx as Parameters<typeof startBreakageFlow>[0]);
      return;
    }

    if (text === BTN.SEARCH) {
      userCtx.set(chatId, { mode: "search" });
      await ctx.reply("🔍 *Поиск товара*\n\nВведите название (или часть названия):", {
        parse_mode: "Markdown",
      });
      return;
    }

    // ---- State-based input ----
    const mode = ctx2?.mode;

    if (mode === "search") {
      await handleSearch(ctx as Parameters<typeof handleSearch>[0], text, role);
      return;
    }

    if (mode === "breakage_qty") {
      const qty = Number(text.replace(",", "."));
      if (isNaN(qty) || qty <= 0) { await ctx.reply("Введите положительное число."); return; }
      userCtx.set(chatId, { ...ctx2!, mode: "breakage_reason", qty });
      await ctx.reply(
        `📉 Количество: *${qty} ${ctx2!.itemUnit ?? "ед."}*\n\nВыберите причину списания:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              ...REASONS.slice(0, 3).map((r, i) => [{ text: r, callback_data: `reason_${i}` }]),
              ...REASONS.slice(3).map((r, i) => [{ text: r, callback_data: `reason_${i + 3}` }]),
              [{ text: "❌ Отмена", callback_data: "cancel" }],
            ],
          },
        }
      );
      return;
    }

    if (mode === "restock_qty") {
      const qty = Number(text.replace(",", "."));
      if (isNaN(qty) || qty <= 0) { await ctx.reply("Введите положительное число."); return; }
      if (!ctx2?.itemId) { await ctx.reply("Ошибка сессии. Начните заново."); return; }

      try {
        const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, ctx2.itemId) });
        if (!item) { await ctx.reply("Товар не найден."); return; }

        const totalCost = Number(item.pricePerUnit) * qty;
        await db.insert(receiptsTable).values({
          itemId: item.id,
          quantity: String(qty),
          pricePerUnit: item.pricePerUnit,
          totalCost: String(totalCost),
          supplier: "Через Telegram-бот",
          notes: `Пополнение через Telegram`,
        });

        await db
          .update(itemsTable)
          .set({ currentStock: sql`CAST(${itemsTable.currentStock} AS DECIMAL) + ${qty}` })
          .where(eq(itemsTable.id, item.id));

        await logAudit({ action: "create", entityType: "receipt", details: `Telegram restock: ${item.name} × ${qty}` });

        const [updated] = await db.select({ currentStock: itemsTable.currentStock }).from(itemsTable).where(eq(itemsTable.id, item.id));

        userCtx.set(chatId, { mode: "warehouse" });
        await ctx.reply(
          `✅ *Пополнение зафиксировано!*\n\n📦 ${item.name}\n📥 Добавлено: *${qty} ${item.unit}*\n📊 Новый остаток: *${Number(updated?.currentStock ?? 0).toFixed(2)} ${item.unit}*\n💰 Сумма: ${fmt(totalCost)} сом`,
          { parse_mode: "Markdown", reply_markup: warehouseKeyboard(role) }
        );
      } catch (err) {
        logger.error({ err }, "Telegram restock error");
        await ctx.reply("Ошибка при пополнении. Попробуйте снова.");
      }
      return;
    }

    // Default: show main menu hint
    await ctx.reply(
      "Используйте кнопки меню ниже или отправьте /menu для возврата в главное меню.",
      { reply_markup: mainKeyboard(role) }
    );
  });

  // ============================== WEBHOOK SETUP ==============================
  // In production use the .replit.app domain; in dev use the .replit.dev tunnel.
  const isProduction = process.env.NODE_ENV === "production";
  const activeDomain = isProduction
    ? (process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim() ?? process.env["REPLIT_DEV_DOMAIN"])
    : process.env["REPLIT_DEV_DOMAIN"];

  if (activeDomain) {
    const webhookPath = `/bot${token.slice(-12)}`;
    const webhookUrl = `https://${activeDomain}/api${webhookPath}`;

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

  // Polling fallback
  bot.launch()
    .then(() => {
      logger.info("Telegram bot started (polling)");
      void checkOverdueRentals();
      setInterval(() => { void checkOverdueRentals(); }, 60 * 60 * 1000);
    })
    .catch((err) => logger.error({ err }, "Failed to start Telegram bot"));

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  return undefined;
}

// ============================================================================
// Exported notification helpers (called from other routes)
// ============================================================================
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
      .select({ telegramChatId: usersTable.telegramChatId })
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

    const text = `⚠️ *НИЗКИЙ ОСТАТОК!*\n\n*${itemName}*\nОстаток: *${currentStock} ${unit}*\nМинимум: ${minThreshold} ${unit}\n\nПроверьте запасы в M-Sklad.`;

    for (const admin of admins) {
      if (!admin.telegramChatId) continue;
      await bot.telegram.sendMessage(Number(admin.telegramChatId), text, { parse_mode: "Markdown" });
    }
  } catch (err) {
    logger.error({ err }, "sendLowStockAlert error");
  }
}

export async function sendHozkaLowStockAlert(
  itemName: string,
  currentStock: number,
  unit: string
): Promise<void> {
  if (!bot) return;
  try {
    const admins = await db
      .select({ telegramChatId: usersTable.telegramChatId })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    const qty = `${Number(currentStock).toFixed(Number.isInteger(currentStock) ? 0 : 2)} ${unit}`;
    const text = `⚠️ *Хозтовары на исходе!*\n\n*${itemName}* осталось всего *${qty}*.\n\nНужно дополнить склад при следующем закупе.`;

    for (const admin of admins) {
      if (!admin.telegramChatId) continue;
      await bot.telegram.sendMessage(Number(admin.telegramChatId), text, { parse_mode: "Markdown" });
    }
  } catch (err) {
    logger.error({ err }, "sendHozkaLowStockAlert error");
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
