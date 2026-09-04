import { getGoogleOAuthClient } from "./client";
import { google } from "googleapis";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
];

export function getGoogleAuthUrl() {
  return getGoogleOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function getTokensFromCode(code: string) {
  const client = getGoogleOAuthClient();

  const { tokens } = await client.getToken(code);

  return tokens;
}

export async function getGoogleUser(tokens: any) {
  const client = getGoogleOAuthClient();

  client.setCredentials(tokens);

  const oauth2 = google.oauth2({
    version: "v2",
    auth: client,
  });

  const { data } = await oauth2.userinfo.get();

  return data;
}