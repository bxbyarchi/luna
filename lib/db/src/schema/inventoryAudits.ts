import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsTable } from "./items";

export const inventoryAuditsTable = pgTable("inventory_audits", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const auditItemsTable = pgTable("audit_items", {
  id: serial("id").primaryKey(),
  auditId: integer("audit_id").notNull().references(() => inventoryAuditsTable.id),
  itemId: integer("item_id").notNull().references(() => itemsTable.id),
  systemStock: numeric("system_stock", { precision: 12, scale: 3 }).notNull(),
  actualStock: numeric("actual_stock", { precision: 12, scale: 3 }),
});

export const insertInventoryAuditSchema = createInsertSchema(inventoryAuditsTable).omit({ id: true, createdAt: true, submittedAt: true });
export type InsertInventoryAudit = z.infer<typeof insertInventoryAuditSchema>;
export type InventoryAudit = typeof inventoryAuditsTable.$inferSelect;
export type AuditItem = typeof auditItemsTable.$inferSelect;
