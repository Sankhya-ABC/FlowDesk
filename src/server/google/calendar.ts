import { google } from "googleapis";
import crypto from "node:crypto";
import { decrypt } from "./crypto";
import { getGoogleOAuthClient } from "./client";
import { findGoogleAccount } from "./repository";
import { encrypt } from "./crypto";
import { updateGoogleTokens } from "./repository";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { clientes } from "../db/schema";

export async function getCalendar(equipeId: string) {
  const account = await findGoogleAccount(equipeId);

  if (!account) {
    throw new Error("Usuário não possui conta Google conectada.");
  }

  const oauth = getGoogleOAuthClient();

  oauth.setCredentials({
    access_token: decrypt(account.accessTokenEncrypted),
    refresh_token: decrypt(account.refreshTokenEncrypted),
  });

  const now = Date.now();

  if (
    !account.expiryDate ||
    new Date(account.expiryDate).getTime() <= now + 60000
  ) {
    const { credentials } = await oauth.refreshAccessToken();

    if (credentials.access_token) {
      oauth.setCredentials({
        access_token: credentials.access_token,
        refresh_token:
          credentials.refresh_token ??
          decrypt(account.refreshTokenEncrypted),
      });

      await updateGoogleTokens(
        equipeId,
        encrypt(credentials.access_token),
        credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : null,
      );
    }
  }

  return google.calendar({
    version: "v3",
    auth: oauth,
  });
}

export async function createCalendarEvent(
  equipeId: string,
  reuniao: any,
) {
  const calendar = await getCalendar(equipeId);

  const inicio = new Date(
    `${reuniao.data}T${reuniao.horaInicio}:00`,
  );

  const fim = new Date(
    `${reuniao.data}T${reuniao.horaFim}:00`,
  );

  const attendees =
    (reuniao.participantesEmails ?? "")
        .split(/[;,]/)
        .map((email: string) => email.trim())
        .filter(Boolean)
        .map((email: string) => ({ email }));
  
  let nomeCliente = "";

    if (reuniao.clienteId) {
    const db = getDb();

    const [cliente] = await db
        .select()
        .from(clientes)
        .where(eq(clientes.id, reuniao.clienteId))
        .limit(1);

    if (cliente?.data) {
        nomeCliente =
        (cliente.data as any).empresa ??
        (cliente.data as any).razaoSocial ??
        "";
    }
  }

  const response = await calendar.events.insert({
    calendarId: "primary",

    conferenceDataVersion: 1,

    sendUpdates: "all",

    requestBody: {
      summary: reuniao.titulo,

      description: `
        Reunião criada pelo FlowDesk

        Cliente:
        ${nomeCliente || "-"}

        Projeto:
        ${reuniao.projetoId ?? "-"}

        Participantes:
        ${reuniao.participantes ?? "-"}
      `,

      start: {
        dateTime: `${reuniao.data}T${reuniao.horaInicio}:00`,
        timeZone: "America/Sao_Paulo",
      },

      end: {
        dateTime: `${reuniao.data}T${reuniao.horaFim}:00`,
        timeZone: "America/Sao_Paulo",
      },

      attendees,

      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
        },
      },
    },
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.hangoutLink,
    htmlLink: response.data.htmlLink,
  };
}

export async function deleteCalendarEvent(
  equipeId: string,
  eventId: string,
) {
  const calendar = await getCalendar(equipeId);

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
  });

  return {
    ok: true,
  };
}