import crypto from "node:crypto";

import { getAuthenticatedEquipeId } from "../auth/session";
import { encrypt } from "./crypto";
import {
  deleteGoogleAccount,
  findGoogleAccount,
  saveGoogleAccount,
} from "./repository";
import {
  getGoogleAuthUrl,
  getGoogleUser,
  getTokensFromCode,
} from "./oauth";
import {
  // suas funções que já existem...
  cancelGoogleMeeting,
} from "./service";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export async function handleGoogleApi(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  const equipeId = getAuthenticatedEquipeId(request);

  if (!equipeId) {
    return json(
      {
        error: "Não autenticado",
      },
      401,
    );
  }

  /*
   * GET /api/google/login
   */

  if (request.method === "GET" && path === "/api/google/login") {
    return Response.redirect(getGoogleAuthUrl(), 302);
  }

  /*
   * GET /api/google/status
   */

  if (request.method === "GET" && path === "/api/google/status") {
    const account = await findGoogleAccount(equipeId);

    return json({
      connected: !!account,
      email: account?.googleEmail ?? null,
    });
  }

  /*
   * POST /api/google/disconnect
   */

  if (request.method === "POST" && path === "/api/google/disconnect") {
    await deleteGoogleAccount(equipeId);

    return json({
      ok: true,
    });
  }

  /*
   * GET /api/google/callback
   */

  if (request.method === "GET" && path === "/api/google/callback") {
    const code = url.searchParams.get("code");

    if (!code) {
      return json(
        {
          error: "Código OAuth não informado.",
        },
        400,
      );
    }

    const tokens = await getTokensFromCode(code);

    const user = await getGoogleUser(tokens);

    if (!user.email) {
      return json(
        {
          error: "Não foi possível obter o email da conta Google.",
        },
        400,
      );
    }

    await saveGoogleAccount({
      id: crypto.randomUUID(),

      equipeId,

      googleEmail: user.email,

      accessTokenEncrypted: encrypt(tokens.access_token!),

      refreshTokenEncrypted: encrypt(tokens.refresh_token!),

      expiryDate: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    });

    return Response.redirect(
      new URL("/system/index.html", request.url),
      302,
    );
  }
  if (request.method === "POST" && path === "/api/google/cancel") {
    const body = (await request.json().catch(() => ({}))) as {
      eventId?: string;
      equipeId?: string;
    };

    if (!body.eventId) {
      return json(
        {
          error: "eventId não informado.",
        },
        400,
      );
    }

    if (!body.equipeId) {
      return json(
        {
          error: "equipeId não informado.",
        },
        400,
      );
    }

    try {
      await cancelGoogleMeeting(body.equipeId, body.eventId);

      return json({
        ok: true,
      });
    } catch (error) {
      console.error("[google/cancel]", error);

      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Erro ao cancelar evento no Google Calendar.",
        },
        500,
      );
    }
  }

  return json(
    {
      error: "Not found",
    },
    404,
  );
}

