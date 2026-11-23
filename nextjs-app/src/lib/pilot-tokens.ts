import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { companyInvites } from "@/db/schema";

export const pilotTokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/);
export const newPasswordSchema = z.string().min(8)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72);

export function hashPilotToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPilotToken() {
  const code = randomBytes(32).toString("base64url");
  return { code, tokenHash: hashPilotToken(code) };
}

export async function consumeCompanyInvite(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  code: string,
  email: string,
  kind: typeof companyInvites.$inferSelect.kind,
) {
  const [used] = await tx.delete(companyInvites).where(and(
    eq(companyInvites.tokenHash, hashPilotToken(code)),
    eq(companyInvites.email, email),
    eq(companyInvites.kind, kind),
    gt(companyInvites.expiresAt, sql`clock_timestamp()`),
  )).returning({ tokenHash: companyInvites.tokenHash });
  return Boolean(used);
}
