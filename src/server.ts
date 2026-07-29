import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleApi } from "./server/db/api";
import { handleAuthApi } from "./server/auth/api";
import { getAuthenticatedEquipeId } from "./server/auth/session";
// `?raw` inlines the HTML at build time — this file is deliberately NOT under
// public/, because nitro serves public/ assets before this fetch() ever runs,
// which would bypass the auth gate below for a plain static file.
import systemShellHtml from "./server/system-shell.html?raw";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/api/auth/")) {
      return handleAuthApi(request);
    }

    if (pathname.startsWith("/api/")) {
      if (!getAuthenticatedEquipeId(request)) {
        return new Response(JSON.stringify({ error: "Não autenticado" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return handleApi(request);
    }

    if (pathname === "/system" || pathname === "/system/" || pathname === "/system/index.html") {
      if (!getAuthenticatedEquipeId(request)) {
        return Response.redirect(new URL("/login.html", request.url), 302);
      }
      return new Response(systemShellHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
