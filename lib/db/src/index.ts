import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const isProd = process.env.NODE_ENV === "production";
const dbUrl = isProd
  ? (process.env.DATABASE_URL_PROD || process.env.DATABASE_URL)
  : (process.env.DATABASE_URL_DEV || process.env.DATABASE_URL);

if (!dbUrl) {
  console.error("WARNING: No database URL set. Database features will not work.");
}
console.log(`[DB] Using ${isProd ? "PRODUCTION" : "DEVELOPMENT"} database`);

export const pool = new Pool({
  connectionString: dbUrl || "postgresql://localhost:5432/mrcodeai",
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
