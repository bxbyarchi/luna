import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const itemsTable = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  unit: text("unit").notNull().default("шт"),
  location: text("location"),
  currentStock: numeric("current_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  minThreshold: numeric("min_threshold", { precision: 12, scale: 3 }),
  pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 2 }).notNull().default("0"),
  photoUrl: text("photo_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;
