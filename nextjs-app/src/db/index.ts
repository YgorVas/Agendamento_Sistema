import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function sanitizeConnectionString(value: string): string {
  try {
    const url = new URL(value);
    // Some Neon connection strings include channel_binding=require. It is a
    // libpq client option; postgres.js would forward it as an unknown startup
    // parameter and the connection would fail.
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return value;
  }
}

const rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error("DATABASE_URL is not set");
}

const connectionString = sanitizeConnectionString(rawConnectionString);

const globalForDb = globalThis as unknown as {
  postgresClient?: postgres.Sql<{}>;
  drizzleDb?: ReturnType<typeof drizzle<typeof schema>>;
};

// `prepare: false` is required when connecting through Neon's pooled endpoint
// (PgBouncer in transaction mode), which does not support named prepared
// statements.
export const client =
  globalForDb.postgresClient ??
  postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = globalForDb.drizzleDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.drizzleDb = db;
}

export { schema };
