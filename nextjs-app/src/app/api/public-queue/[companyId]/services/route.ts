export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { companies, services } from "@/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId: rawCompanyId } = await params;
  const companyId = Number(rawCompanyId);
  if (!companyId || isNaN(companyId)) {
    return NextResponse.json(
      { erro: "Estabelecimento não encontrado." },
      { status: 404 }
    );
  }

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.active, true)),
  });

  if (!company) {
    return NextResponse.json(
      { erro: "Estabelecimento não encontrado." },
      { status: 404 }
    );
  }

  const list = await db
    .select({
      id: services.id,
      name: services.name,
      price: services.price,
      durationMinutes: services.durationMinutes,
    })
    .from(services)
    .where(eq(services.companyId, companyId))
    .orderBy(services.name, services.id);

  return NextResponse.json(
    { nome_fantasia: company.name, servicos: list },
    { headers: { "Cache-Control": "no-store" } }
  );
}
