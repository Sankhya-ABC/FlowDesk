import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

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
