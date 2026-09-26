import { pgTable, serial, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { itemsTable } from "./items";

export const productRecipeItemsTable = pgTable("product_recipe_items", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => itemsTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  productItemUnique: uniqueIndex("product_recipe_product_item_uq").on(table.productId, table.itemId),
}));

export const insertProductRecipeItemSchema = createInsertSchema(productRecipeItemsTable).omit({ id: true, createdAt: true });
export type InsertProductRecipeItem = z.infer<typeof insertProductRecipeItemSchema>;
export type ProductRecipeItem = typeof productRecipeItemsTable.$inferSelect;
