export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { users, userCompanies, companies } from "@/db/schema";
import {
  safeVerifyPassword,
  signAccessToken,
  signSelectionToken,
} from "@/lib/auth";
import { setAuthCookie } from "@/lib/cookies";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email().max(254),
  senha: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Informe um e-mail e uma senha válidos." },
      { status: 400 }
    );
  }

  const { email, senha } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  });

  const senhaValida = await safeVerifyPassword(senha, user?.passwordHash);
  if (!user || !senhaValida) {
    return NextResponse.json(
      { erro: "E-mail ou senha inválidos." },
      { status: 401 }
    );
  }

  const memberships = await db
    .select({
      comercioId: companies.id,
      nomeFantasia: companies.name,
      cargo: userCompanies.role,
    })
    .from(userCompanies)
    .innerJoin(companies, eq(userCompanies.companyId, companies.id))
    .where(and(eq(userCompanies.userId, user.id), eq(companies.active, true)))
    .orderBy(companies.name, companies.id);

  if (memberships.length === 0) {
    return NextResponse.json(
      { erro: "Usuário sem acesso a um comércio ativo." },
      { status: 403 }
    );
  }

  if (memberships.length === 1) {
    const [{ comercioId, cargo }] = memberships;
    const token = signAccessToken({ userId: user.id, companyId: comercioId, role: cargo });
    setAuthCookie(token);
    return NextResponse.json({ token, comercioId, cargo });
  }

  const selectionToken = signSelectionToken({ userId: user.id });
  return NextResponse.json({
    tokenTemporario: selectionToken,
    comercios: memberships,
  });
}
