import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "flowdesk_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 dias

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSessionToken(equipeId: string): string {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${equipeId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [equipeId, expiresAtRaw, signature] = parts;
  const payload = `${equipeId}.${expiresAtRaw}`;
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return equipeId;
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setSessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getAuthenticatedEquipeId(request: Request): string | null {
  return verifySessionToken(readSessionCookie(request));
}
