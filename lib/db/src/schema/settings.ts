import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  orgName: text("org_name").notNull().default("M-Sklad"),
  currency: text("currency").notNull().default("KGS"),
  timezone: text("timezone").notNull().default("Asia/Bishkek"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
