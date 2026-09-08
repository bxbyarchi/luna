import { pgTable, serial, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { itemsTable } from "./items";
import { locationsTable } from "./locations";

export const warehouseStockTable = pgTable("warehouse_stock", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => itemsTable.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locationsTable.id, { onDelete: "cascade" }),
  currentStock: numeric("current_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  itemLocationUnique: uniqueIndex("warehouse_stock_item_location_uq").on(table.itemId, table.locationId),
}));

export type WarehouseStock = typeof warehouseStockTable.$inferSelect;
