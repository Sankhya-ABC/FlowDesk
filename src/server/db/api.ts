import { eq } from "drizzle-orm";
import { getAuthenticatedEquipeId } from "../auth/session";
import { syncMeetingWithGoogle } from "../google/service";
import { getDb } from "./client";
import { type CollectionName, equipe, tables } from "./schema";

// Assinaturas de transição de CS: quem pode assinar por cada "key" fixa é
// decidido aqui pelo e-mail cadastrado, nunca pelo nome que vier no payload
// (o nome digitado no front é só um label, não prova identidade).
// A key "gp" não entra aqui: ela é validada contra o gpId da própria transição.
const TRANSICAO_ASSINANTE_EMAILS: Record<string, string> = {
  rogerio: "rogerio.sorci@sankhya.com.br",
  renato: "renato.xavier@sankhya.com.br",
  gustavo: "gustavo.germano@sankhya.com.br",
};

// Todas as assinaturas obrigatórias de uma transição.
// O GP é dinâmico, então ele não entra no mapa de e-mails acima.
const TRANSICAO_ASSINANTES = [
  { key: "gp" },
  { key: "rogerio" },
  { key: "renato" },
  { key: "gustavo" },
] as const;

/**
 * Impede qualquer alteração em uma transição que já foi totalmente assinada.
 *
 * Esta validação precisa existir no backend porque o bloqueio visual do
 * frontend não é uma barreira de segurança: um cliente pode ignorar o JS e
 * chamar o endpoint /api/transicoes diretamente.
 *
 * A regra vale para qualquer alteração do registro depois que todas as keys
 * obrigatórias de assinatura estiverem preenchidas. A assinatura final ainda
 * pode ser gravada normalmente, porque o registro só fica bloqueado a partir
 * do próximo request.
 */
async function assertTransicaoNaoAssinada(
  col: CollectionName,
  row: Record<string, unknown>,
) {
  if (col !== "transicoes" || !row.id || typeof row.id !== "string") return;

  const db = getDb();
  const [existingRow] = await db
    .select()
    .from(tables[col])
    .where(eq(tables[col].id, row.id))
    .limit(1);

  if (!existingRow) return;

  const existingData = existingRow.data as Record<string, unknown> | undefined;
  const existingAssinaturas =
    (existingData?.assinaturas as Record<string, unknown> | undefined) || {};

  const documentoJaAssinado = TRANSICAO_ASSINANTES.every(
    (assinante) => Boolean(existingAssinaturas[assinante.key]),
  );

  if (documentoJaAssinado) {
    throw new ApiError(
      "Esta transição já foi assinada por todos os signatários e não pode mais ser alterada.",
      409,
    );
  }
}

/**
 * Garante que, para cada assinatura NOVA ou ALTERADA em `row.assinaturas`
 * (comparado ao que já está salvo no banco), quem está logado (equipeId da
 * sessão) é de fato a pessoa autorizada a ocupar aquela key — comparando por
 * e-mail cadastrado, nunca pelo nome enviado no body. Assinaturas já
 * existentes e que não mudaram passam direto (o form reenvia a transição
 * inteira a cada save, então não é "esse request não tem assinatura" e sim
 * "essa assinatura específica não é nova"). Uma assinatura já existente só
 * pode ser alterada/removida por quem é dono dela.
 * Lança ApiError para abortar o upsert com 401/403 se algo for inválido.
 */
async function assertAssinaturasAutorizadas(
  col: CollectionName,
  row: Record<string, unknown>,
  request: Request,
) {
  const assinaturas = row.assinaturas as Record<string, unknown> | undefined;
  if (!assinaturas || typeof assinaturas !== "object") return;

  const db = getDb();
  const [existingRow] = await db
    .select()
    .from(tables[col])
    .where(eq(tables[col].id, row.id as string))
    .limit(1);
  const existingAssinaturas =
    ((existingRow?.data as Record<string, unknown> | undefined)?.assinaturas as
      | Record<string, unknown>
      | undefined) || {};

  // Quais keys mudaram de fato (nova assinatura, alterada, ou removida)?
  const changedKeys = Object.keys(assinaturas).filter(
    (key) => JSON.stringify(assinaturas[key]) !== JSON.stringify(existingAssinaturas[key]),
  );
  const removedKeys = Object.keys(existingAssinaturas).filter(
    (key) => !(key in assinaturas),
  );
  const keysToCheck = [...new Set([...changedKeys, ...removedKeys])];
  if (keysToCheck.length === 0) return;

  const equipeId = getAuthenticatedEquipeId(request);
  if (!equipeId) throw new ApiError("Não autenticado", 401);

  const [member] = await db.select().from(equipe).where(eq(equipe.id, equipeId)).limit(1);
  if (!member) throw new ApiError("Não autenticado", 401);

  const memberData = member.data as Record<string, unknown>;
  const memberEmail = typeof memberData.email === "string" ? memberData.email.toLowerCase() : "";

  for (const key of keysToCheck) {
    if (key === "gp") {
      // O GP responsável é dinâmico: precisa ser a pessoa referenciada em row.gpId.
      if (row.gpId !== equipeId) {
        throw new ApiError("Você não é o GP responsável por esta transição", 403);
      }
      continue;
    }

    const expectedEmail = TRANSICAO_ASSINANTE_EMAILS[key];
    if (!expectedEmail) {
      // Key desconhecida: por segurança, não deixa passar.
      throw new ApiError(`Assinante desconhecido: ${key}`, 400);
    }
    if (!memberEmail || memberEmail !== expectedEmail.toLowerCase()) {
      throw new ApiError("Você não tem permissão para assinar como este aprovador", 403);
    }
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

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

  if (col === "transicoes") {
    const [existingRow] = await db
      .select()
      .from(table)
      .where(eq(table.id, id))
      .limit(1);

    if (!existingRow) {
      return json({ error: "Transição não encontrada" }, 404);
    }

    const existingData = existingRow.data as Record<string, unknown> | undefined;
    const existingAssinaturas =
      (existingData?.assinaturas as Record<string, unknown> | undefined) || {};

    const documentoJaAssinado = TRANSICAO_ASSINANTES.every(
      (assinante) => Boolean(existingAssinaturas[assinante.key]),
    );

    if (documentoJaAssinado) {
      throw new ApiError(
        "Esta transição já foi assinada por todos os signatários e não pode ser excluída.",
        409,
      );
    }
  }

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
      let row = (await request.json()) as Record<string, any>;

      if (col === "transicoes") {
        // Primeiro bloqueia qualquer edição de uma transição já finalizada.
        // Depois mantém a validação existente das assinaturas/identidade.
        await assertTransicaoNaoAssinada(col, row);
        await assertAssinaturasAutorizadas(col, row, request);
      }

      if (col === "reunioes") {
        const equipeId = getAuthenticatedEquipeId(request);

        if (equipeId) {
          try {
            row = await syncMeetingWithGoogle(
              equipeId,
              row,
            );
          } catch (error) {
            console.error("[google-calendar]", error);

            // Não impede o salvamento da reunião.
            row.googleError =
              error instanceof Error
                ? error.message
                : "Erro ao sincronizar com Google.";
          }
        }
      }

      return await upsert(col, row);
    }

    if (request.method === "DELETE" && id) {
      return await remove(col, id);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message }, error.status);
    }
    console.error("[api]", error);
    return json({ error: "Internal error" }, 500);
  }
}