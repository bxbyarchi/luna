import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locationsTable).omit({ id: true, createdAt: true });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;

export const DEFAULT_LOCATIONS = [
  { name: "Кой Таш", code: "KOI_TASH" },
  { name: "Площадь", code: "PLOSHAD" },
  { name: "Азия Молл", code: "ASIA_MALL" },
  { name: "Скай Парк", code: "SKY_PARK" },
  { name: "Ош", code: "OSH" },
] as const;
