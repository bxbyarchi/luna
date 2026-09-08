import { pgTable, serial, text, timestamp, integer, numeric, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsTable } from "./items";
import { locationsTable } from "./locations";

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => itemsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id, { onDelete: "set null" }),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 2 }).notNull(),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 }).notNull(),
  supplier: text("supplier"),
  photoUrl: text("photo_url"),
  photoUrls: json("photo_urls").$type<string[]>().default([]),
  notes: text("notes"),
  recordedByClerkId: text("recorded_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReceiptSchema = createInsertSchema(receiptsTable).omit({ id: true, createdAt: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receiptsTable.$inferSelect;
