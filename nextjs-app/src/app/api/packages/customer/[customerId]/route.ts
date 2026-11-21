export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { customerPackages, servicePackages, customers } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { customerId: string } }
) {
  try {
    const auth = await requireAuth(request);
    const customerId = Number(params.customerId);
    if (!customerId || isNaN(customerId)) {
      return NextResponse.json({ erro: "Invalid customer id" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: customerPackages.id,
        packageName: servicePackages.name,
        serviceId: servicePackages.serviceId,
        totalSessions: servicePackages.totalSessions,
        remainingSessions: customerPackages.remainingSessions,
        purchaseDate: customerPackages.purchaseDate,
        validUntil: customerPackages.validUntil,
        status: customerPackages.status,
      })
      .from(customerPackages)
      .innerJoin(
        servicePackages,
        eq(customerPackages.packageId, servicePackages.id)
      )
      .innerJoin(customers, eq(customerPackages.customerId, customers.id))
      .where(
        and(
          eq(customerPackages.customerId, customerId),
          eq(customers.companyId, auth.companyId),
          eq(servicePackages.companyId, auth.companyId)
        )
      );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = rows.map((row) => {
      const validUntil = new Date(row.validUntil);
      validUntil.setHours(0, 0, 0, 0);
      const displayStatus =
        row.status === "ativo" && validUntil < today ? "expirado" : row.status;
      return {
        ...row,
        status: displayStatus,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("List customer packages error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao buscar pacotes do cliente." },
      { status: 500 }
    );
  }
}
