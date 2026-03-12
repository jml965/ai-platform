import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const creditsLedgerTable = pgTable("credits_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amountUsd: numeric("amount_usd", { precision: 10, scale: 6 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 10, scale: 6 }).notNull(),
  description: text("description"),
  referenceId: text("reference_id"),
  referenceType: text("reference_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCreditLedgerSchema = createInsertSchema(creditsLedgerTable).omit({ id: true, createdAt: true });
export type InsertCreditLedger = z.infer<typeof insertCreditLedgerSchema>;
export type CreditLedger = typeof creditsLedgerTable.$inferSelect;
