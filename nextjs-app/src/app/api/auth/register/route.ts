export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { companies, users, userCompanies } from "@/db/schema";
import { hashPassword, ResponseError, signAccessToken } from "@/lib/auth";
import { setAuthCookie } from "@/lib/cookies";
import { consumeCompanyInvite, newPasswordSchema, pilotTokenSchema } from "@/lib/pilot-tokens";
import { limitRequest } from "@/lib/rate-limit";
import { z } from "zod";

const registerSchema = z.object({
  empresa: z.string().trim().min(1).max(100),
  nome: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(100).toLowerCase(),
  telefone: z.string().min(1).max(20),
  senha: newPasswordSchema,
  convite: pilotTokenSchema,
});

export async function POST(request: Request) {
  const limited = await limitRequest(request, "registration");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Confira os dados e o código do convite. A senha deve ter pelo menos 8 caracteres e até 72 bytes." },
      { status: 400 }
    );
  }

  const { empresa, nome, email, telefone, senha, convite } = parsed.data;
  const normalizedPhone = telefone.replace(/\D/g, "");

  try {
    const result = await db.transaction(async (tx) => {
      if (!await consumeCompanyInvite(tx, convite, email, "cadastro")) {
        throw new ResponseError("Convite inválido, expirado ou emitido para outro e-mail.", 403);
      }
      const passwordHash = await hashPassword(senha);

      const [company] = await tx
        .insert(companies)
        .values({
          name: empresa.trim(),
          email,
          phone: normalizedPhone,
          passwordHash,
        })
        .onConflictDoNothing({ target: companies.email })
        .returning({ id: companies.id });
      if (!company) throw new ResponseError("Este e-mail já está cadastrado.", 409);

      const [user] = await tx
        .insert(users)
        .values({
          name: nome.trim(),
          email,
          passwordHash,
        })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (!user) throw new ResponseError("Este e-mail já está cadastrado.", 409);

      await tx.insert(userCompanies).values({
        userId: user.id,
        companyId: company.id,
        role: "ADMIN",
      });

      return { userId: user.id, companyId: company.id, role: "ADMIN" as const };
    });

    const token = signAccessToken(result);
    await setAuthCookie(token);

    return NextResponse.json(
      { mensagem: "Empresa e conta criadas com sucesso!", ...result },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Registration error:", err instanceof Error ? err.name : "unknown error");
    return NextResponse.json(
      { erro: "Erro interno ao cadastrar." },
      { status: 500 }
    );
  }
}
