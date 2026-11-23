export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { customerPackages, servicePackages, customers } from "@/db/schema";
import { requireAuth, requireManagement, ResponseError } from "@/lib/auth";
import { todaySPString } from "@/lib/date";
import { z } from "zod";

const databaseId = z.coerce.number().int().positive().max(2147483647);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const customerId = databaseId.safeParse((await params).customerId);
    if (!customerId.success) {
      return NextResponse.json({ erro: "Cliente inválido." }, { status: 400 });
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
          eq(customerPackages.customerId, customerId.data),
          eq(customers.companyId, auth.companyId),
          eq(servicePackages.companyId, auth.companyId),
          ne(customerPackages.status, "cancelado")
        )
      )
      .orderBy(desc(customerPackages.purchaseDate), desc(customerPackages.id));

    const today = todaySPString();

    const result = rows.map((row) => {
      const validUntil = row.validUntil.toISOString().slice(0, 10);
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const auth = await requireManagement(request);
    const customerId = databaseId.safeParse((await params).customerId);
    const assignmentId = databaseId.safeParse(new URL(request.url).searchParams.get("pacote"));
    if (!customerId.success || !assignmentId.success) {
      return NextResponse.json({ erro: "Cliente ou pacote inválido." }, { status: 400 });
    }

    const [removed] = await db
      .update(customerPackages)
      .set({ status: "cancelado" })
      .from(customers)
      .where(and(
        eq(customerPackages.id, assignmentId.data),
        eq(customerPackages.customerId, customerId.data),
        eq(customerPackages.customerId, customers.id),
        eq(customers.companyId, auth.companyId)
      ))
      .returning({ id: customerPackages.id });

    if (!removed) {
      return NextResponse.json({ erro: "Pacote do cliente não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ mensagem: "Pacote removido do cliente." });
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Remove customer package error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao remover o pacote do cliente." },
      { status: 500 }
    );
  }
}
