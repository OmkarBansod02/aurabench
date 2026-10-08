import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openDatabase } from "../lib/db/index.mts";

let database: ReturnType<typeof openDatabase> | undefined;
try {
  database = openDatabase();
  await migrate(database.db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.log("Database migrations applied.");
} catch {
  console.error("Migration failed. Check DATABASE_URL, database access, and migration files.");
  process.exitCode = 1;
} finally {
  await database?.close();
}
