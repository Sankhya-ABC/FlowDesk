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
export const transicoes = pgTable("transicoes", collection("transicoes"));

export const tables = { clientes, projetos, demandas, equipe, reunioes, transicoes };

export type CollectionName = keyof typeof tables;

// Documentos anexados a uma demanda (escopo, entrega, etc.). Deliberadamente
// FORA de `tables`/CollectionName: upload/download são binários e passam por
// rotas próprias em vez do passthrough JSON genérico /api/:col.
export const documentos = pgTable("documentos", {
  id: text("id").primaryKey(),
  demandaId: text("demanda_id")
    .notNull()
    .references(() => demandas.id, { onDelete: "cascade" }),
  nomeArquivo: text("nome_arquivo").notNull(),
  nomeArmazenado: text("nome_armazenado").notNull(), // nome do arquivo em disco (uuid-original)
  tipo: text("tipo"), // mime type, quando disponível
  tamanho: text("tamanho").notNull(), // bytes, como texto pra evitar limite de int
  enviadoPorId: text("enviado_por_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

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

export const googleAccounts = pgTable("google_accounts", {
  id: text("id").primaryKey(),

  equipeId: text("equipe_id")
    .notNull()
    .unique()
    .references(() => equipe.id, { onDelete: "cascade" }),

  googleEmail: text("google_email").notNull(),

  accessTokenEncrypted: text("access_token_encrypted").notNull(),

  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),

  expiryDate: timestamp("expiry_date", {
    withTimezone: true,
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  }).defaultNow(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  }).defaultNow(),
});