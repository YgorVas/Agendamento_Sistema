export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { companies, users, userCompanies } from "@/db/schema";
import { hashPassword, signAccessToken } from "@/lib/auth";
import { setAuthCookie } from "@/lib/cookies";
import { z } from "zod";

const registerSchema = z.object({
  empresa: z.string().min(1).max(100),
  nome: z.string().min(1).max(100),
  email: z.string().email().max(100),
  telefone: z.string().min(1).max(20),
  senha: z.string().min(8),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Confira os dados e use uma senha de pelo menos 8 caracteres." },
      { status: 400 }
    );
  }

  const { empresa, nome, email, telefone, senha } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = telefone.replace(/\D/g, "");

  try {
    const result = await db.transaction(async (tx) => {
      const passwordHash = await hashPassword(senha);

      const [company] = await tx
        .insert(companies)
        .values({
          name: empresa.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash,
        })
        .returning({ id: companies.id });

      const [user] = await tx
        .insert(users)
        .values({
          name: nome.trim(),
          email: normalizedEmail,
          passwordHash,
        })
        .returning({ id: users.id });

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
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json(
        { erro: "Este e-mail já está cadastrado." },
        { status: 409 }
      );
    }
    console.error("Registration error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao cadastrar." },
      { status: 500 }
    );
  }
}
