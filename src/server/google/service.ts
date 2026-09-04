import {
  createCalendarEvent,
  deleteCalendarEvent,
} from "./calendar";


export async function syncMeetingWithGoogle(
  equipeId: string,
  reuniao: Record<string, any>,
) {
  // Se não houver data ou horário, apenas retorna.
  if (
    !reuniao.data ||
    !reuniao.horaInicio ||
    !reuniao.horaFim
  ) {
    return reuniao;
  }

  // Se já existe um evento Google, por enquanto não cria outro.
  if (reuniao.google?.eventId) {
    return reuniao;
  }

  const google = await createCalendarEvent(
    equipeId,
    reuniao,
  );

  return {
    ...reuniao,

    google: {
      eventId: google.eventId,
      meetLink: google.meetLink,
      htmlLink: google.htmlLink,
      calendarId: "primary",
      syncedAt: new Date().toISOString(),
    },
  };
}

export async function cancelGoogleMeeting(
  equipeId: string,
  eventId: string,
) {
  if (!eventId) {
    throw new Error("Google eventId não informado.");
  }

  return await deleteCalendarEvent(equipeId, eventId);
}