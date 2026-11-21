import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function sanitizeConnectionString(value: string): string {
  try {
    const url = new URL(value);
    // channel_binding is a libpq option that pg/postgres.js cannot negotiate.
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return value;
  }
}

const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Set DATABASE_URL_UNPOOLED (Neon direct/unpooled) or DATABASE_URL before running Drizzle Kit."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    // DDL/migrations should use Neon's direct (non-pooled) endpoint.
    url: sanitizeConnectionString(url),
  },
});
