import { eq, sql } from "drizzle-orm";

import { getDb } from "../db/client";
import { credentials, equipe } from "../db/schema";
import {
  clearSessionCookieHeader,
  createSessionToken,
  getAuthenticatedEquipeId,
  setSessionCookieHeader,
} from "./session";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function login(request: Request): Promise<Response> {
  const { email, senha } = (await request.json().catch(() => ({}))) as {
    email?: string;
    senha?: string;
  };
  if (!email || !senha) {
    return json({ error: "Informe email e senha" }, 400);
  }

  const db = getDb();
  const [member] = await db
    .select()
    .from(equipe)
    .where(sql`lower(${equipe.data}->>'email') = lower(${email})`)
    .limit(1);

  if (!member) {
    return json({ error: "Email não encontrado na equipe" }, 401);
  }

  const [existing] = await db
    .select()
    .from(credentials)
    .where(eq(credentials.id, member.id))
    .limit(1);

  if (!existing) {
    // Primeiro acesso: a senha digitada agora vira a senha da conta.
    const passwordHash = await Bun.password.hash(senha);
    await db.insert(credentials).values({ id: member.id, passwordHash });
  } else {
    const valid = await Bun.password.verify(senha, existing.passwordHash);
    if (!valid) return json({ error: "Senha incorreta" }, 401);
  }

  const token = createSessionToken(member.id);
  const data = member.data as Record<string, unknown>;
  return json(
    { ok: true, user: { id: member.id, nome: data.nome, cargo: data.cargo } },
    200,
    { "set-cookie": setSessionCookieHeader(token) },
  );
}

function logout(): Response {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookieHeader() });
}

async function me(request: Request): Promise<Response> {
  const equipeId = getAuthenticatedEquipeId(request);
  if (!equipeId) return json({ error: "Não autenticado" }, 401);

  const db = getDb();
  const [member] = await db.select().from(equipe).where(eq(equipe.id, equipeId)).limit(1);
  if (!member) return json({ error: "Não autenticado" }, 401);

  const data = member.data as Record<string, unknown>;
  return json({ id: member.id, nome: data.nome, cargo: data.cargo, email: data.email });
}

export async function handleAuthApi(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    if (request.method === "POST" && path === "/api/auth/login") return await login(request);
    if (request.method === "POST" && path === "/api/auth/logout") return logout();
    if (request.method === "GET" && path === "/api/auth/me") return await me(request);
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("[auth]", error);
    return json({ error: "Internal error" }, 500);
  }
}
