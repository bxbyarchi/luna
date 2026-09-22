import { pgTable, serial, integer, text, numeric, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { housesTable } from "./houses";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  houseId: integer("house_id").notNull().references(() => housesTable.id),
  category: text("category").notNull(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  houseNameUnique: uniqueIndex("products_house_name_uq").on(table.houseId, table.name),
}));

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
