import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsTable } from "./items";
import { staffTable } from "./staff";
import { locationsTable } from "./locations";

export const writeOffsTable = pgTable("write_offs", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => itemsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id, { onDelete: "set null" }),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  reason: text("reason").notNull(),
  staffId: integer("staff_id").references(() => staffTable.id),
  photoUrl: text("photo_url"),
  notes: text("notes"),
  totalValue: numeric("total_value", { precision: 14, scale: 2 }).notNull().default("0"),
  recordedByClerkId: text("recorded_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWriteOffSchema = createInsertSchema(writeOffsTable).omit({ id: true, createdAt: true });
export type InsertWriteOff = z.infer<typeof insertWriteOffSchema>;
export type WriteOff = typeof writeOffsTable.$inferSelect;
