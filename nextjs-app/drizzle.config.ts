import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    // Prefer Railway's public URL when running migrations from a local machine.
    url: process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL!,
  },
});
