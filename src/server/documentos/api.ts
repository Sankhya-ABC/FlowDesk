import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { getAuthenticatedEquipeId } from "../auth/session";
import { getDb } from "../db/client";
import { demandas, documentos, projetos } from "../db/schema";

// Tudo fica fora do repo git e do build; caminho fixo em disco.
// Em produção (Docker), monte um volume nesse diretório pra persistir entre deploys.
const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function demandaDir(demandaId: string) {
  // demandaId vem do banco (nunca direto da URL sem validar), mas ainda assim
  // sanitiza pra nunca deixar um ../ virar path traversal em disco.
  const safeId = demandaId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(UPLOAD_ROOT, safeId);
}

async function ensureDemandaExists(demandaId: string) {
  const db = getDb();
  const [row] = await db.select().from(demandas).where(eq(demandas.id, demandaId)).limit(1);
  return row ?? null;
}

async function handleUpload(request: Request): Promise<Response> {
  const equipeId = getAuthenticatedEquipeId(request);
  const form = await request.formData();
  const demandaId = form.get("demandaId");
  const file = form.get("file");

  if (typeof demandaId !== "string" || !demandaId) {
    return json({ error: "demandaId é obrigatório" }, 400);
  }
  if (!(file instanceof File)) {
    return json({ error: "Arquivo é obrigatório" }, 400);
  }

  const demanda = await ensureDemandaExists(demandaId);
  if (!demanda) {
    return json({ error: "Demanda não encontrada" }, 404);
  }

  const dir = demandaDir(demandaId);
  await mkdir(dir, { recursive: true });

  const id = randomUUID();
  const nomeArmazenado = `${id}-${file.name}`;
  const destPath = path.join(dir, nomeArmazenado);

  const bytes = Buffer.from(await file.arrayBuffer());
  await Bun.write(destPath, bytes);

  const db = getDb();
  await db.insert(documentos).values({
    id,
    demandaId,
    nomeArquivo: file.name,
    nomeArmazenado,
    tipo: file.type || null,
    tamanho: String(bytes.byteLength),
    enviadoPorId: equipeId ?? null,
  });

  return json({
    id,
    demandaId,
    nomeArquivo: file.name,
    tipo: file.type || null,
    tamanho: bytes.byteLength,
    createdAt: new Date().toISOString(),
  });
}

async function handleList(demandaId: string): Promise<Response> {
  const db = getDb();
  const rows = await db
    .select()
    .from(documentos)
    .where(eq(documentos.demandaId, demandaId));

  return json(
    rows.map((r) => ({
      id: r.id,
      demandaId: r.demandaId,
      nomeArquivo: r.nomeArquivo,
      tipo: r.tipo,
      tamanho: Number(r.tamanho),
      createdAt: r.createdAt,
    })),
  );
}

async function handleDownload(id: string): Promise<Response> {
  const db = getDb();
  const [row] = await db.select().from(documentos).where(eq(documentos.id, id)).limit(1);
  if (!row) return json({ error: "Documento não encontrado" }, 404);

  const filePath = path.join(demandaDir(row.demandaId), row.nomeArmazenado);
  try {
    const fileStat = await stat(filePath);
    const fileBuffer = await readFile(filePath);
    const asciiFallback = row.nomeArquivo.replace(/[^\x20-\x7E]/g, "_");
    return new Response(fileBuffer, {
      headers: {
        "content-type": row.tipo || "application/octet-stream",
        "content-length": String(fileStat.size),
        "content-disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(row.nomeArquivo)}`,
      },
    });
  } catch {
    return json({ error: "Arquivo não encontrado em disco" }, 404);
  }
}

async function handleDelete(id: string): Promise<Response> {
  const db = getDb();
  const [row] = await db.select().from(documentos).where(eq(documentos.id, id)).limit(1);
  if (!row) return json({ error: "Documento não encontrado" }, 404);

  const filePath = path.join(demandaDir(row.demandaId), row.nomeArmazenado);
  await rm(filePath, { force: true });
  await db.delete(documentos).where(eq(documentos.id, id));

  return json({ ok: true });
}

// Sanitiza um nome pra usar como entrada/pasta dentro do zip.
function sanitizeZipName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "sem-nome";
}

async function handleProjetoZip(projetoId: string): Promise<Response> {
  const db = getDb();

  const [projeto] = await db.select().from(projetos).where(eq(projetos.id, projetoId)).limit(1);
  if (!projeto) return json({ error: "Projeto não encontrado" }, 404);

  // projetoId não é coluna própria: cada linha de `demandas` é {id, data jsonb},
  // então filtra em memória depois de trazer tudo (mesmo padrão do resto do app).
  const todasDemandas = await db.select().from(demandas);
  const demandasDoProjeto = todasDemandas.filter(
    (d) => (d.data as Record<string, unknown>)?.projetoId === projetoId,
  );

  if (demandasDoProjeto.length === 0) {
    return json({ error: "Este projeto não tem demandas com documentos" }, 404);
  }

  const demandaIds = demandasDoProjeto.map((d) => d.id);
  const todosDocumentos = await db.select().from(documentos);
  const docsRelevantes = todosDocumentos.filter((doc) => demandaIds.includes(doc.demandaId));

  if (docsRelevantes.length === 0) {
    return json({ error: "Nenhum documento encontrado para as demandas deste projeto" }, 404);
  }

  const nomeDemandaPorId = new Map(
    demandasDoProjeto.map((d) => {
      const data = d.data as Record<string, unknown>;
      const titulo = typeof data?.titulo === "string" ? data.titulo : d.id;
      return [d.id, sanitizeZipName(`${titulo}`)];
    }),
  );

  // Evita colisão quando duas demandas têm o mesmo título sanitizado.
  const usedFolderNames = new Map<string, number>();
  const folderNameForDemanda = new Map<string, string>();
  for (const [demandaId, baseName] of nomeDemandaPorId) {
    const count = usedFolderNames.get(baseName) ?? 0;
    usedFolderNames.set(baseName, count + 1);
    folderNameForDemanda.set(demandaId, count === 0 ? baseName : `${baseName}-${count}`);
  }

  const zipInput: Record<string, Uint8Array> = {};
  for (const doc of docsRelevantes) {
    const filePath = path.join(demandaDir(doc.demandaId), doc.nomeArmazenado);
    try {
      const bytes = await readFile(filePath);
      const folder = folderNameForDemanda.get(doc.demandaId) ?? doc.demandaId;
      const entryName = `${folder}/${sanitizeZipName(doc.nomeArquivo)}`;
      zipInput[entryName] = new Uint8Array(bytes);
    } catch {
      // Arquivo sumiu do disco mas o registro ficou no banco: pula, não derruba o zip inteiro.
      continue;
    }
  }

  const zipped = zipSync(zipInput, { level: 6 });
  const projetoData = projeto.data as Record<string, unknown>;
  const nomeProjeto = sanitizeZipName(
    typeof projetoData?.nome === "string" ? projetoData.nome : projetoId,
  );

  const asciiFallback = nomeProjeto.replace(/[^\x20-\x7E]/g, "_");
  return new Response(zipped, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="documentos-${asciiFallback}.zip"; filename*=UTF-8''documentos-${encodeURIComponent(nomeProjeto)}.zip`,
    },
  });
}

// Roteador desta feature. Chamado a partir de server.ts para qualquer request
// abaixo de /api/documentos e para /api/projetos/:id/documentos.zip.
export async function handleDocumentosApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "documentos", ...] ou ["api","projetos",":id","documentos.zip"]

  try {
    if (parts[1] === "projetos" && parts[3] === "documentos.zip" && request.method === "GET") {
      return await handleProjetoZip(parts[2]);
    }

    if (parts[1] === "documentos") {
      const sub = parts[2];

      if (request.method === "POST" && !sub) {
        return await handleUpload(request);
      }

      if (request.method === "GET" && !sub) {
        const demandaId = url.searchParams.get("demandaId");
        if (!demandaId) return json({ error: "demandaId é obrigatório" }, 400);
        return await handleList(demandaId);
      }

      if (request.method === "GET" && sub && parts[3] === "download") {
        return await handleDownload(sub);
      }

      if (request.method === "DELETE" && sub) {
        return await handleDelete(sub);
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("[documentos-api]", error);
    return json({ error: "Internal error" }, 500);
  }
}
