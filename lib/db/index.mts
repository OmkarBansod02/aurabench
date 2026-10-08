import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.mts";

export function openDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString?.trim()) throw new Error("Set DATABASE_URL.");
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10_000 });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

export type Database = ReturnType<typeof openDatabase>["db"];
