import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shiftsTable } from "./shifts";
import { registersTable } from "./registers";

export const paymentMethods = ["cash", "card"] as const;
export const saleStatus = ["completed", "returned", "partially_returned"] as const;

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id").notNull().references(() => shiftsTable.id),
  registerId: integer("register_id").notNull().references(() => registersTable.id),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  status: text("status").notNull().default("completed"),
  createdByClerkId: text("created_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;

export const saleItemsTable = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => salesTable.id),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  returnedQuantity: numeric("returned_quantity", { precision: 12, scale: 3 }).notNull().default("0"),
});

export type SaleItem = typeof saleItemsTable.$inferSelect;

export const returnsTable = pgTable("returns", {
  id: serial("id").primaryKey(),
  saleItemId: integer("sale_item_id").notNull().references(() => saleItemsTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  createdByClerkId: text("created_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Return = typeof returnsTable.$inferSelect;
