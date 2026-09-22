import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shiftsTable } from "./shifts";

export const cashMovementTypes = ["collection", "deposit"] as const;

export const cashMovementsTable = pgTable("cash_movements", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id").notNull().references(() => shiftsTable.id),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  createdByClerkId: text("created_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCashMovementSchema = createInsertSchema(cashMovementsTable).omit({ id: true, createdAt: true });
export type InsertCashMovement = z.infer<typeof insertCashMovementSchema>;
export type CashMovement = typeof cashMovementsTable.$inferSelect;
