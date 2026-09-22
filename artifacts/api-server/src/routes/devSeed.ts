import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../lib/requireAuth";
import {
  db, locationsTable, DEFAULT_LOCATIONS, categoriesTable, itemsTable, warehouseStockTable,
  staffTable, housesTable, registersTable, shiftsTable, salesTable, saleItemsTable, returnsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "../middleware/rbac";

const router: IRouter = Router();

const CATEGORIES = [
  { name: "Мебель", slug: "mebel" },
  { name: "Инвентарь", slug: "inventar" },
  { name: "Продукты питания", slug: "produkty" },
  { name: "Напитки", slug: "napitki" },
  { name: "Реквизит", slug: "rekvizit" },
];

const ITEMS: Array<{ name: string; categorySlug: string; unit: string; price: number; stock: number }> = [
  { name: "Стол банкетный", categorySlug: "mebel", unit: "шт", price: 3500, stock: 40 },
  { name: "Стул складной", categorySlug: "mebel", unit: "шт", price: 800, stock: 150 },
  { name: "Гирлянда светодиодная", categorySlug: "inventar", unit: "шт", price: 450, stock: 80 },
  { name: "Термос для чая 5л", categorySlug: "inventar", unit: "шт", price: 1200, stock: 25 },
  { name: "Мука пшеничная", categorySlug: "produkty", unit: "кг", price: 65, stock: 300 },
  { name: "Сахар", categorySlug: "produkty", unit: "кг", price: 90, stock: 200 },
  { name: "Курут сушёный", categorySlug: "produkty", unit: "кг", price: 700, stock: 60 },
  { name: "Чай чёрный листовой", categorySlug: "napitki", unit: "кг", price: 900, stock: 40 },
  { name: "Кофе зерновой", categorySlug: "napitki", unit: "кг", price: 1800, stock: 20 },
  { name: "Костюм Санты", categorySlug: "rekvizit", unit: "шт", price: 4500, stock: 8 },
];

const HOUSE_MENU: Record<string, Array<{ name: string; price: number }>> = {
  "Трдельник": [{ name: "Трдельник классический", price: 150 }, { name: "Трдельник с шоколадом", price: 180 }, { name: "Трдельник с мороженым", price: 220 }],
  "Фри": [{ name: "Картофель фри малая", price: 100 }, { name: "Картофель фри большая", price: 150 }],
  "Ыссык курут": [{ name: "Курут порция", price: 80 }, { name: "Курут набор", price: 150 }],
  "Чай/кофе": [{ name: "Чай", price: 60 }, { name: "Кофе", price: 100 }, { name: "Глинтвейн", price: 180 }],
  "Дом Санты": [{ name: "Фото с Сантой", price: 200 }, { name: "Подарок от Санты", price: 150 }],
  "Барбекю": [{ name: "Шашлык говядина", price: 250 }, { name: "Шашлык курица", price: 200 }],
  "Маршмеллоу и сосиски": [{ name: "Маршмеллоу на шпажке", price: 70 }, { name: "Хот-дог", price: 120 }],
};

const HOUSE_NAMES = Object.keys(HOUSE_MENU);

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

router.post("/admin/seed-demo-data", requireAuth(), requireRole("admin"), async (req: Request, res: Response) => {
  const summary = { locations: 0, categories: 0, items: 0, houses: 0, registers: 0, staff: 0, shifts: 0, sales: 0, returns: 0 };

  await db.insert(locationsTable).values([...DEFAULT_LOCATIONS]).onConflictDoNothing();
  const allLocations = await db.query.locationsTable.findMany();
  summary.locations = allLocations.length;
  const venues = allLocations.filter((l) => l.isVenue);
  const central = allLocations.find((l) => l.code === "BISHKEK_CENTRAL");

  await db.insert(categoriesTable).values(CATEGORIES).onConflictDoNothing();
  const cats = await db.query.categoriesTable.findMany();
  summary.categories = cats.length;

  if (central) {
    for (const it of ITEMS) {
      const cat = cats.find((c) => c.slug === it.categorySlug);
      if (!cat) continue;
      const existing = await db.query.itemsTable.findFirst({ where: eq(itemsTable.name, it.name) });
      if (existing) continue;
      const [created] = await db.insert(itemsTable).values({
        name: it.name, categoryId: cat.id, unit: it.unit, pricePerUnit: String(it.price), currentStock: String(it.stock),
      }).returning();
      await db.insert(warehouseStockTable).values({ itemId: created.id, locationId: central.id, currentStock: String(it.stock) }).onConflictDoNothing();
      summary.items++;
    }
  }

  const staffFirstNames = ["Айгуль", "Данияр", "Нурлан", "Салтанат", "Эрмек", "Жамиля", "Бекзат", "Айнура", "Максат", "Чолпон"];
  for (const venue of venues) {
    const existingStaff = await db.query.staffTable.findMany({ where: eq(staffTable.locationId, venue.id) });
    if (existingStaff.length > 0) continue;
    for (let i = 0; i < 2; i++) {
      await db.insert(staffTable).values({
        name: `${pick(staffFirstNames)} ${pick(["Асанов", "Бекова", "Токтогулов", "Жумабекова", "Осмонов"])}`,
        position: pick(["Продавец", "Кассир", "Администратор точки"]),
        phone: `+996 5${randInt(10, 99)} ${randInt(100, 999)} ${randInt(100, 999)}`,
        locationId: venue.id,
      });
      summary.staff++;
    }
  }

  for (const venue of venues) {
    for (const houseName of HOUSE_NAMES) {
      let house = await db.query.housesTable.findFirst({ where: and(eq(housesTable.locationId, venue.id), eq(housesTable.name, houseName)) });
      if (!house) {
        const [created] = await db.insert(housesTable).values({ name: houseName, locationId: venue.id }).returning();
        house = created;
        summary.houses++;
      }

      let register = await db.query.registersTable.findFirst({ where: and(eq(registersTable.houseId, house.id), eq(registersTable.name, "Касса 1")) });
      if (!register) {
        const [created] = await db.insert(registersTable).values({ houseId: house.id, name: "Касса 1" }).returning();
        register = created;
        summary.registers++;
      }

      const hasShift = await db.query.shiftsTable.findFirst({ where: eq(shiftsTable.registerId, register.id) });
      if (hasShift) continue;

      const menu = HOUSE_MENU[houseName];
      const openingCash = randInt(500, 1500);
      const [shift] = await db.insert(shiftsTable).values({
        registerId: register.id,
        cashierName: `${pick(staffFirstNames)} ${pick(["Асанов", "Бекова", "Токтогулов"])}`,
        openingCash: String(openingCash),
        status: "open",
      }).returning();
      summary.shifts++;

      let totalCash = 0;
      let totalCard = 0;
      const salesForReturn: Array<{ saleId: number; itemId: number; qty: number; price: number; name: string }> = [];

      const salesCount = randInt(4, 9);
      for (let s = 0; s < salesCount; s++) {
        const method = Math.random() < 0.6 ? "cash" : "card";
        const lineCount = randInt(1, 3);
        const lines = Array.from({ length: lineCount }, () => {
          const product = pick(menu);
          return { name: product.name, quantity: randInt(1, 3), pricePerUnit: product.price };
        });
        const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.pricePerUnit, 0);
        const [sale] = await db.insert(salesTable).values({
          shiftId: shift.id, registerId: register.id, totalAmount: String(totalAmount), paymentMethod: method,
        }).returning();
        summary.sales++;
        const insertedItems = await db.insert(saleItemsTable).values(lines.map((l) => ({
          saleId: sale.id, name: l.name, quantity: String(l.quantity), pricePerUnit: String(l.pricePerUnit), totalPrice: String(l.quantity * l.pricePerUnit),
        }))).returning();

        if (method === "cash") totalCash += totalAmount; else totalCard += totalAmount;
        if (Math.random() < 0.15) {
          const target = pick(insertedItems);
          salesForReturn.push({ saleId: sale.id, itemId: target.id, qty: 1, price: Number(target.pricePerUnit), name: target.name });
        }
      }

      let totalReturns = 0;
      for (const r of salesForReturn) {
        const amount = r.qty * r.price;
        totalReturns += amount;
        await db.insert(returnsTable).values({ saleItemId: r.itemId, quantity: String(r.qty), amount: String(amount), reason: "Демо-возврат" });
        await db.update(saleItemsTable).set({ returnedQuantity: sql`${saleItemsTable.returnedQuantity} + ${r.qty}` }).where(eq(saleItemsTable.id, r.itemId));
        await db.update(salesTable).set({ status: "partially_returned" }).where(eq(salesTable.id, r.saleId));
        summary.returns++;
      }

      const expectedCash = openingCash + totalCash - totalReturns;
      const countedCash = expectedCash + (Math.random() < 0.7 ? 0 : randInt(-20, 20));

      const shouldCloseShift = Math.random() < 0.8;
      await db.update(shiftsTable).set({
        totalSalesCash: String(totalCash),
        totalSalesCard: String(totalCard),
        totalReturns: String(totalReturns),
        ...(shouldCloseShift ? {
          status: "closed",
          closingCashCounted: String(countedCash),
          expectedCash: String(expectedCash),
          cashDifference: String(countedCash - expectedCash),
          closedAt: new Date(),
        } : {}),
      }).where(eq(shiftsTable.id, shift.id));
    }
  }

  res.json({ ok: true, summary });
});

export default router;
