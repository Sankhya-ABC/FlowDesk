import { eq } from "drizzle-orm";

import { getDb } from "./client";
import { type CollectionName, tables } from "./schema";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isCollection(name: string): name is CollectionName {
  return name in tables;
}

async function bootstrap() {
  const db = getDb();
  const entries = await Promise.all(
    (Object.keys(tables) as CollectionName[]).map(async (name) => {
      const rows = await db.select().from(tables[name]);
      return [name, rows.map((r) => r.data)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function upsert(col: CollectionName, row: Record<string, unknown>) {
  if (!row.id || typeof row.id !== "string") {
    return json({ error: "row.id is required" }, 400);
  }
  const table = tables[col];
  const db = getDb();
  await db
    .insert(table)
    .values({ id: row.id, data: row })
    .onConflictDoUpdate({ target: table.id, set: { data: row } });
  return json(row);
}

async function remove(col: CollectionName, id: string) {
  const table = tables[col];
  const db = getDb();
  await db.delete(table).where(eq(table.id, id));
  return json({ ok: true });
}

export async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // "/api/bootstrap" | "/api/:col" | "/api/:col/:id"
  const parts = url.pathname.split("/").filter(Boolean).slice(1);

  try {
    if (request.method === "GET" && parts[0] === "bootstrap" && parts.length === 1) {
      return json(await bootstrap());
    }

    const [col, id] = parts;
    if (!col || !isCollection(col)) {
      return json({ error: `Unknown collection: ${col ?? ""}` }, 404);
    }

    if (request.method === "POST" && !id) {
      const row = (await request.json()) as Record<string, unknown>;
      return await upsert(col, row);
    }

    if (request.method === "DELETE" && id) {
      return await remove(col, id);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("[api]", error);
    return json({ error: "Internal error" }, 500);
  }
}
