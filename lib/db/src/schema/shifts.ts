import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { registersTable } from "./registers";

export const shiftStatus = ["open", "closed"] as const;

export const shiftsTable = pgTable("shifts", {
  id: serial("id").primaryKey(),
  registerId: integer("register_id").notNull().references(() => registersTable.id),
  cashierName: text("cashier_name").notNull(),
  status: text("status").notNull().default("open"),
  openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  closingCashCounted: numeric("closing_cash_counted", { precision: 12, scale: 2 }),
  expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }),
  cashDifference: numeric("cash_difference", { precision: 12, scale: 2 }),
  totalSalesCash: numeric("total_sales_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  totalSalesCard: numeric("total_sales_card", { precision: 12, scale: 2 }).notNull().default("0"),
  totalReturns: numeric("total_returns", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  openedByClerkId: text("opened_by_clerk_id"),
  closedByClerkId: text("closed_by_clerk_id"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertShiftSchema = createInsertSchema(shiftsTable).omit({ id: true, openedAt: true });
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shiftsTable.$inferSelect;
