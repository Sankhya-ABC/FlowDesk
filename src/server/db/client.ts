import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // Fail fast when Postgres is unreachable, so /api/bootstrap errors out quickly
    // instead of hanging — the frontend depends on that to fall back to offline mode.
    client = postgres(url, { connect_timeout: 5 });
  }
  return drizzle(client, { schema });
}
