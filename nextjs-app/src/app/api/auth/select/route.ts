export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { userCompanies, companies } from "@/db/schema";
import { getBearerToken, signAccessToken, verifySelectionToken } from "@/lib/auth";
import { setAuthCookie } from "@/lib/cookies";
import { z } from "zod";

const selectSchema = z.object({
  comercioId: z.number().int().positive(),
});

export async function POST(request: Request) {
  const selectionToken = getBearerToken(request);
  if (!selectionToken) {
    return NextResponse.json(
      { erro: "Token de seleção inválido ou expirado." },
      { status: 401 }
    );
  }

  const payload = verifySelectionToken(selectionToken);
  if (!payload) {
    return NextResponse.json(
      { erro: "Token de seleção inválido ou expirado." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
  }

  const parsed = selectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Informe um comercioId inteiro positivo." },
      { status: 400 }
    );
  }

  const { comercioId } = parsed.data;

  const [membership] = await db
    .select({ role: userCompanies.role })
    .from(userCompanies)
    .innerJoin(companies, eq(userCompanies.companyId, companies.id))
    .where(
      and(
        eq(userCompanies.userId, payload.userId),
        eq(userCompanies.companyId, comercioId),
        eq(companies.active, true)
      )
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json(
      { erro: "Acesso indisponível para este comércio." },
      { status: 403 }
    );
  }

  const accessToken = signAccessToken({
    userId: payload.userId,
    companyId: comercioId,
    role: membership.role,
  });
  setAuthCookie(accessToken);

  return NextResponse.json({
    token: accessToken,
    comercioId,
    cargo: membership.role,
  });
}
