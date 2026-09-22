import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { locationsTable } from "./locations";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: text("position"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  locationId: integer("location_id").references(() => locationsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staffTable.$inferSelect;
