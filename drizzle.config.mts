import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.mts",
  out: "./drizzle",
  dialect: "postgresql",
});
