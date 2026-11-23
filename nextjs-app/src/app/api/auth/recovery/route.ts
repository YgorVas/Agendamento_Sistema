import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { clearAuthCookie } from "@/lib/cookies";
import { hashPilotToken, newPasswordSchema, pilotTokenSchema } from "@/lib/pilot-tokens";
import { limitRequest } from "@/lib/rate-limit";

const recoverySchema = z.object({ codigo: pilotTokenSchema, senha: newPasswordSchema });

export async function POST(request: Request) {
  const limited = await limitRequest(request, "recovery");
  if (limited) return limited;

  const parsed = recoverySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Confira o código e use uma senha de pelo menos 8 caracteres e até 72 bytes." },
      { status: 400 },
    );
  }

  const { codigo, senha } = parsed.data;
  const tokenHash = hashPilotToken(codigo);
  const validToken = and(eq(passwordResets.tokenHash, tokenHash), gt(passwordResets.expiresAt, sql`clock_timestamp()`));
  const [available] = await db.select({ userId: passwordResets.userId }).from(passwordResets).where(validToken);
  if (available) {
    const passwordHash = await hashPassword(senha);
    const changed = await db.transaction(async (tx) => {
      const [used] = await tx.delete(passwordResets).where(validToken).returning({ userId: passwordResets.userId });
      if (!used) return false;

      await tx.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
        .where(eq(users.id, used.userId));
      return true;
    });
    if (changed) {
      await clearAuthCookie();
      return NextResponse.json({ mensagem: "Senha redefinida. Entre com a nova senha." });
    }
  }

  return NextResponse.json({ erro: "Código inválido, expirado ou já usado." }, { status: 400 });
}
