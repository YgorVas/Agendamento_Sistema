import "dotenv/config";
import postgres from "postgres";

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(adminUrl);
} catch {
  console.error("DATABASE_URL is not a valid URL");
  process.exit(1);
}

const dbName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
if (!dbName) {
  console.error("Could not parse database name from DATABASE_URL");
  process.exit(1);
}

const adminParsedUrl = new URL(parsedUrl.toString());
adminParsedUrl.pathname = "/postgres";
const baseUrl = adminParsedUrl.toString();

async function main() {
  const sql = postgres(baseUrl, { max: 1 });
  try {
    const exists = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (exists.length === 0) {
      await sql`CREATE DATABASE ${sql.unsafe(dbName)}`;
      console.log(`Database ${dbName} created.`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
