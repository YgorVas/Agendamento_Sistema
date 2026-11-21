export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { companies, userCompanies } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";

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

    return NextResponse.json({ comercios: memberships, comercioAtual: current });
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
