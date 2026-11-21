import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const globalForDb = globalThis as unknown as {
  postgresClient?: postgres.Sql<{}>;
  drizzleDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export const client =
  globalForDb.postgresClient ?? postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = globalForDb.drizzleDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.drizzleDb = db;
}

export { schema };
