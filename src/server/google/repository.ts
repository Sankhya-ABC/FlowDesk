import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { googleAccounts } from "../db/schema";

export async function findGoogleAccount(equipeId: string) {
  const db = getDb();

  const [account] = await db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.equipeId, equipeId))
    .limit(1);

  return account ?? null;
}

export async function saveGoogleAccount(data: {
    id: string;
    equipeId: string;
    googleEmail: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    expiryDate?: Date | null;
    }) {
    const db = getDb();

    const existing = await findGoogleAccount(data.equipeId);

    if (existing) {
        await db
        .update(googleAccounts)
        .set({
            googleEmail: data.googleEmail,
            accessTokenEncrypted: data.accessTokenEncrypted,
            refreshTokenEncrypted: data.refreshTokenEncrypted,
            expiryDate: data.expiryDate ?? null,
            updatedAt: new Date(),
        })
        .where(eq(googleAccounts.equipeId, data.equipeId));

        return;
    }

    await db.insert(googleAccounts).values({
        ...data,
        updatedAt: new Date(),
    });
}

export async function deleteGoogleAccount(equipeId: string) {
  const db = getDb();

  await db
    .delete(googleAccounts)
    .where(eq(googleAccounts.equipeId, equipeId));
}

export async function updateGoogleTokens(
  equipeId: string,
  accessTokenEncrypted: string,
  expiryDate: Date | null,
) {
  const db = getDb();

  await db
    .update(googleAccounts)
    .set({
      accessTokenEncrypted: accessTokenEncrypted,
      expiryDate,
      updatedAt: new Date(),
    })
    .where(eq(googleAccounts.equipeId, equipeId));
}