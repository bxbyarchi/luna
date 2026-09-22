import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  isVenue: boolean("is_venue").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locationsTable).omit({ id: true, createdAt: true });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;

export const DEFAULT_LOCATIONS = [
  { name: "Бишкек — центральный", code: "BISHKEK_CENTRAL", isVenue: false },
  { name: "Кой Таш", code: "KOI_TASH", isVenue: true },
  { name: "Площадь", code: "PLOSHAD", isVenue: true },
  { name: "Азия Молл", code: "ASIA_MALL", isVenue: true },
  { name: "Скай Парк", code: "SKY_PARK", isVenue: true },
  { name: "Ош", code: "OSH", isVenue: true },
  { name: "Лермонтова", code: "LERMONTOVA", isVenue: false },
  { name: "Прохладное", code: "PROKHLADNOE", isVenue: false },
] as const;

export const VENUE_LOCATION_CODES = DEFAULT_LOCATIONS.filter((l) => l.isVenue).map((l) => l.code);
