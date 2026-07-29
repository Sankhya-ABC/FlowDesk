import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Each table mirrors one `Store` collection (public/system/data.js) as a plain
// id + full-record blob. The prototype's records grow ad-hoc fields per form
// (checklist, comentarios, historico, etc.) — storing the whole row as-sent
// keeps the API a faithful passthrough instead of a second schema to maintain
// in lockstep with the vanilla-JS forms.
const collection = (name: string) => ({
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
});

export const clientes = pgTable("clientes", collection("clientes"));
export const projetos = pgTable("projetos", collection("projetos"));
export const demandas = pgTable("demandas", collection("demandas"));
export const equipe = pgTable("equipe", collection("equipe"));
export const reunioes = pgTable("reunioes", collection("reunioes"));

export const tables = { clientes, projetos, demandas, equipe, reunioes };

export type CollectionName = keyof typeof tables;

// Login credentials for `equipe` members. Deliberately NOT in `tables` above —
// that map drives the generic /api/bootstrap + /api/:col passthrough, and a
// password hash must never round-trip back to the client through it.
export const credentials = pgTable("credentials", {
  id: text("id")
    .primaryKey()
    .references(() => equipe.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
