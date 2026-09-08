import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { itemsTable } from "./items";
import { locationsTable } from "./locations";

export const transferStatus = ["pending", "accepted", "rejected", "cancelled"] as const;

export const transfersTable = pgTable("warehouse_transfers", {
  id: serial("id").primaryKey(),
  fromLocationId: integer("from_location_id").notNull().references(() => locationsTable.id),
  toLocationId: integer("to_location_id").notNull().references(() => locationsTable.id),
  itemId: integer("item_id").notNull().references(() => itemsTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  createdByClerkId: text("created_by_clerk_id"),
  acceptedByClerkId: text("accepted_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export type Transfer = typeof transfersTable.$inferSelect;
