import { defineConfig } from "drizzle-kit";
import path from "path";

const isProd = process.env.NODE_ENV === "production";
const dbUrl = isProd
  ? (process.env.DATABASE_URL_PROD || process.env.DATABASE_URL)
  : (process.env.DATABASE_URL_DEV || process.env.DATABASE_URL);

if (!dbUrl) {
  throw new Error("No database URL set. Set DATABASE_URL_DEV or DATABASE_URL_PROD or DATABASE_URL.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
