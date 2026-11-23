import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customerDataRequests, customers, dataRequestKind } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";

const requestSchema = z.object({
  cliente_id: z.number().int().positive().max(2147483647),
  tipo: z.enum(dataRequestKind.enumValues),
});

async function requireAdmin(request: Request) {
  const auth = await requireAuth(request);
  if (auth.role !== "ADMIN") {
    throw new ResponseError("Somente administradores podem gerenciar solicitações de dados.", 403);
  }
  return auth;
}

function failure(error: unknown) {
  if (error instanceof ResponseError) {
    return NextResponse.json({ erro: error.message }, { status: error.status });
  }
  console.error("Customer data requests:", error instanceof Error ? error.name : "unknown error");
  return NextResponse.json({ erro: "Não foi possível acessar as solicitações." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    const requests = await db.select({
      id: customerDataRequests.id,
      tipo: customerDataRequests.kind,
      status: customerDataRequests.status,
      cliente: customers.name,
      criada_em: customerDataRequests.createdAt,
    }).from(customerDataRequests)
      .leftJoin(customers, and(eq(customers.id, customerDataRequests.customerId), eq(customers.companyId, auth.companyId)))
      .where(eq(customerDataRequests.companyId, auth.companyId))
      .orderBy(desc(customerDataRequests.id));
    return NextResponse.json(requests, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ResponseError("Informe o cliente e o tipo de solicitação.", 400);

    const { cliente_id: customerId, tipo: kind } = parsed.data;
    const created = await db.transaction(async (tx) => {
      const [customer] = await tx.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.companyId, auth.companyId)))
        .for("key share");
      if (!customer) throw new ResponseError("Cliente não encontrado nesta loja.", 404);

      const [row] = await tx.insert(customerDataRequests)
        .values({ customerId, companyId: auth.companyId, requestedBy: auth.userId, kind })
        .onConflictDoNothing()
        .returning({ id: customerDataRequests.id });
      if (!row) throw new ResponseError("Já existe uma solicitação pendente desse tipo para este cliente.", 409);
      return row;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
