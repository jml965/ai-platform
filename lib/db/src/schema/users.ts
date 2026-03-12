import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  replitId: text("replit_id").unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("en"),
  dailyLimitUsd: numeric("daily_limit_usd", { precision: 10, scale: 4 }).default("5.0000"),
  monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 10, scale: 4 }).default("50.0000"),
  perProjectLimitUsd: numeric("per_project_limit_usd", { precision: 10, scale: 4 }),
  creditBalanceUsd: numeric("credit_balance_usd", { precision: 10, scale: 6 }).notNull().default("0.000000"),
  activePlanId: uuid("active_plan_id"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
