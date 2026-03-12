import { pgTable, uuid, text, timestamp, numeric, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const plansTable = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  slug: text("slug").notNull().unique(),
  priceMonthlyUsd: numeric("price_monthly_usd", { precision: 10, scale: 2 }).notNull(),
  priceYearlyUsd: numeric("price_yearly_usd", { precision: 10, scale: 2 }),
  maxProjects: integer("max_projects").notNull(),
  monthlyTokenLimit: integer("monthly_token_limit").notNull(),
  dailyLimitUsd: numeric("daily_limit_usd", { precision: 10, scale: 4 }).notNull(),
  monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 10, scale: 4 }).notNull(),
  supportType: text("support_type").notNull().default("community"),
  features: jsonb("features").$type<Record<string, boolean>>().default({}),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({ id: true, createdAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plansTable.$inferSelect;
