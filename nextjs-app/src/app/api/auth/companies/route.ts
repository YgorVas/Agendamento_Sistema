export const dynamic = "force-dynamic";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { companies, userCompanies } from "@/db/schema";
import { hashPassword, requireAuth, ResponseError, signAccessToken } from "@/lib/auth";
import { setAuthCookie } from "@/lib/cookies";
import { consumeCompanyInvite, pilotTokenSchema } from "@/lib/pilot-tokens";
import { limitRequest } from "@/lib/rate-limit";
import { z } from "zod";

const createCompanySchema = z.object({
  empresa: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(100).toLowerCase(),
  convite: pilotTokenSchema,
  telefone: z.string().trim().max(20).regex(/^\+?[\d ().-]+$/)
    .transform((phone) => phone.replace(/\D/g, ""))
    .pipe(z.string().min(10).max(15)),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const memberships = await db
      .select({
        comercioId: companies.id,
        nomeFantasia: companies.name,
        cargo: userCompanies.role,
      })
      .from(userCompanies)
      .innerJoin(companies, eq(userCompanies.companyId, companies.id))
      .where(and(eq(userCompanies.userId, auth.userId), eq(companies.active, true)))
      .orderBy(companies.name, companies.id);

    const current = memberships.find((m) => m.comercioId === auth.companyId);
    if (!current || current.cargo !== auth.role) {
      return NextResponse.json(
        { erro: "Acesso indisponível para este comércio." },
        { status: 403 }
      );
    }

    return NextResponse.json({ comercios: memberships, comercioAtual: current, usuarioNome: auth.userName });
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Companies error:", err);
    return NextResponse.json(
      { erro: "Erro interno." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const forbidden = "Somente administradores podem criar outra empresa.";
    if (auth.role !== "ADMIN") throw new ResponseError(forbidden, 403);
    const limited = await limitRequest(request, "registration");
    if (limited) return limited;

    const parsed = createCompanySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ResponseError("Confira o nome, o e-mail, o WhatsApp e o convite da empresa.", 400);
    }

    const { empresa, email, telefone, convite } = parsed.data;
    const companyId = await db.transaction(async (tx) => {
      const [membership] = await tx
        .select({ companyId: companies.id })
        .from(userCompanies)
        .innerJoin(companies, eq(userCompanies.companyId, companies.id))
        .where(and(
          eq(userCompanies.userId, auth.userId),
          eq(userCompanies.companyId, auth.companyId),
          eq(userCompanies.role, "ADMIN"),
          eq(companies.active, true),
        ))
        .for("share");
      if (!membership) throw new ResponseError(forbidden, 403);
      if (!await consumeCompanyInvite(tx, convite, email, "nova-loja")) {
        throw new ResponseError("Convite inválido, expirado ou emitido para outro e-mail.", 403);
      }

      // Login uses the existing user account. The company record still requires a password hash.
      const passwordHash = await hashPassword(randomUUID());
      const [company] = await tx
        .insert(companies)
        .values({ name: empresa, email, phone: telefone, passwordHash })
        .onConflictDoNothing({ target: companies.email })
        .returning({ id: companies.id });
      if (!company) {
        throw new ResponseError("Este e-mail já está cadastrado para uma empresa.", 409);
      }

      await tx.insert(userCompanies).values({
        userId: auth.userId,
        companyId: company.id,
        role: "ADMIN",
      });
      return company.id;
    });

    await setAuthCookie(signAccessToken({
      userId: auth.userId,
      sessionVersion: auth.sessionVersion,
      companyId,
      role: "ADMIN",
    }));
    return NextResponse.json({ comercioId: companyId }, { status: 201 });
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Create company error:", err instanceof Error ? err.name : "unknown error");
    return NextResponse.json({ erro: "Não foi possível criar a empresa." }, { status: 500 });
  }
}
