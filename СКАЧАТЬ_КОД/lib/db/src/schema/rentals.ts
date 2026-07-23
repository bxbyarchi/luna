import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsTable } from "./items";

export const rentalsTable = pgTable("rentals", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => itemsTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  renterName: text("renter_name").notNull(),
  renterPhone: text("renter_phone"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  plannedReturnAt: timestamp("planned_return_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("active"),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRentalSchema = createInsertSchema(rentalsTable).omit({ id: true, createdAt: true });
export type InsertRental = z.infer<typeof insertRentalSchema>;
export type Rental = typeof rentalsTable.$inferSelect;
