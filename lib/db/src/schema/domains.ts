import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const domainsTable = pgTable("domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  status: text("status").notNull().default("pending"),
  dnsVerified: boolean("dns_verified").notNull().default(false),
  sslIssued: boolean("ssl_issued").notNull().default(false),
  sslExpiresAt: timestamp("ssl_expires_at"),
  verificationToken: text("verification_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Domain = typeof domainsTable.$inferSelect;
export type InsertDomain = typeof domainsTable.$inferInsert;
