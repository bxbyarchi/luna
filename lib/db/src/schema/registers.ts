import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { housesTable } from "./houses";

export const registersTable = pgTable("registers", {
  id: serial("id").primaryKey(),
  houseId: integer("house_id").notNull().references(() => housesTable.id),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  houseNameUnique: uniqueIndex("registers_house_name_uq").on(table.houseId, table.name),
}));

export const insertRegisterSchema = createInsertSchema(registersTable).omit({ id: true, createdAt: true });
export type InsertRegister = z.infer<typeof insertRegisterSchema>;
export type Register = typeof registersTable.$inferSelect;
