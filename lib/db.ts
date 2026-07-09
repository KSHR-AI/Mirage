import postgres from "postgres";
import { requireEnv } from "./env";

let client: postgres.Sql | undefined;

export function sql() {
  if (!client) {
    client = postgres(
      process.env.MIRAGE_DATABASE_URL ??
        process.env.SUPABASE_POOLER_URL ??
        requireEnv("SUPABASE_DB_URL"),
      {
        max: 1,
        prepare: false,
        ssl: "require",
      },
    );
  }

  return client;
}
