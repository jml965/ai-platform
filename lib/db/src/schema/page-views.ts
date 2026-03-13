import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const pageViewsTable = pgTable("page_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  path: text("path").notNull().default("/"),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  browser: text("browser"),
  os: text("os"),
  device: text("device"),
  country: text("country"),
  language: text("language"),
  sessionId: text("session_id"),
  visitorId: text("visitor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pv_project_created_idx").on(table.projectId, table.createdAt),
  index("pv_project_path_idx").on(table.projectId, table.path),
  index("pv_project_referrer_idx").on(table.projectId, table.referrer),
]);

export type PageView = typeof pageViewsTable.$inferSelect;
