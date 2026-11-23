export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { customerPackages, customers, servicePackages } from "@/db/schema";
import { requireManagement, ResponseError } from "@/lib/auth";
import { z } from "zod";

const sellSchema = z.object({
  cliente_id: z.number().int().positive(),
  pacote_id: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireManagement(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
    }

    const parsed = sellSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Os campos cliente_id e pacote_id são obrigatórios." },
        { status: 400 }
      );
    }

    const { cliente_id, pacote_id } = parsed.data;

    const { sold, result } = await db.transaction(async (tx) => {
      const [result] = await tx
        .select({
          totalSessions: servicePackages.totalSessions,
          validityDays: servicePackages.validityDays,
        })
        .from(servicePackages)
        .innerJoin(customers, eq(servicePackages.companyId, customers.companyId))
        .where(
          and(
            eq(servicePackages.id, pacote_id),
            eq(servicePackages.companyId, auth.companyId),
            eq(servicePackages.available, true),
            eq(customers.id, cliente_id)
          )
        )
        .limit(1)
        .for("share", { of: servicePackages });

      if (!result) {
        throw new ResponseError("Cliente ou pacote não encontrado.", 404);
      }

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + result.validityDays);

      const [sold] = await tx
        .insert(customerPackages)
        .values({
          customerId: cliente_id,
          packageId: pacote_id,
          remainingSessions: result.totalSessions,
          validUntil,
        })
        .returning();
      return { sold, result };
    });

    return NextResponse.json(
      {
        mensagem: "Pacote vendido/atribuído ao cliente com sucesso!",
        cliente_pacote_id: sold.id,
        sessoes_iniciais: result.totalSessions,
        dias_validade: result.validityDays,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Sell package error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao processar a venda do pacote." },
      { status: 500 }
    );
  }
}
