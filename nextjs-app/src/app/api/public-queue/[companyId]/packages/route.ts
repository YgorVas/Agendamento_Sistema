export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { customerPackages, customers, servicePackages } from "@/db/schema";
import { phoneVariants } from "@/lib/phone";
import { parseISODate, todaySPString } from "@/lib/date";

/**
 * Public lookup of a customer's usable packages for a company.
 * Identifies the customer by phone (same normalization used when joining the
 * queue) and only returns packages that can actually be used today.
 */
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

  const telefone = new URL(request.url).searchParams.get("telefone")?.trim() ?? "";
  const digits = telefone.replace(/\D/g, "");
  if (digits.length < 10) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const [variantA, variantB] = phoneVariants(telefone);
  const normalizedPhone = sql<string>`regexp_replace(${customers.phone}, '[^0-9]', '', 'g')`;
  const today = parseISODate(todaySPString());

  const rows = await db
    .select({
      id: customerPackages.id,
      packageName: servicePackages.name,
      serviceId: servicePackages.serviceId,
      remainingSessions: customerPackages.remainingSessions,
      validUntil: customerPackages.validUntil,
    })
    .from(customerPackages)
    .innerJoin(
      servicePackages,
      eq(customerPackages.packageId, servicePackages.id)
    )
    .innerJoin(customers, eq(customerPackages.customerId, customers.id))
    .where(
      and(
        eq(customers.companyId, companyId),
        sql`${normalizedPhone} IN (${variantA}, ${variantB})`,
        eq(servicePackages.companyId, companyId),
        eq(customerPackages.status, "ativo"),
        sql`${customerPackages.remainingSessions} > 0`,
        sql`${customerPackages.validUntil} >= ${sql.param(today, customerPackages.validUntil)}`
      )
    )
    .orderBy(servicePackages.name, customerPackages.validUntil);

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}
