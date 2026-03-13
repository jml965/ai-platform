import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const pwaSettingsTable = pgTable("pwa_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }).unique(),
  enabled: boolean("enabled").notNull().default(false),
  appName: text("app_name").notNull().default("My App"),
  shortName: text("short_name").notNull().default("App"),
  description: text("description"),
  themeColor: text("theme_color").notNull().default("#1f6feb"),
  backgroundColor: text("background_color").notNull().default("#ffffff"),
  display: text("display").notNull().default("standalone"),
  orientation: text("orientation").notNull().default("any"),
  iconUrl: text("icon_url"),
  startUrl: text("start_url").notNull().default("/"),
  offlineEnabled: boolean("offline_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PwaSettings = typeof pwaSettingsTable.$inferSelect;
export type InsertPwaSettings = typeof pwaSettingsTable.$inferInsert;
