export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import {
  servicePackages,
  services,
  customers,
  customerPackages,
  companies,
} from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import { z } from "zod";

const packageSchema = z.object({
  nome: z.string().min(1).max(100),
  descricao: z.string().max(2000).optional(),
  servico_id: z.number().int().positive(),
  total_sessoes: z.number().int().positive(),
  preco_total: z.number().positive(),
  dias_validade: z.number().int().positive().default(30),
});

async function requireManagement(request: Request) {
  const auth = await requireAuth(request);
  if (auth.role !== "ADMIN" && auth.role !== "GERENTE") {
    throw new ResponseError("Esta operação exige um cargo de gestão.", 403);
  }
  return auth;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const list = await db
      .select({
        id: servicePackages.id,
        companyId: servicePackages.companyId,
        serviceId: servicePackages.serviceId,
        name: servicePackages.name,
        description: servicePackages.description,
        totalSessions: servicePackages.totalSessions,
        totalPrice: servicePackages.totalPrice,
        validityDays: servicePackages.validityDays,
      })
      .from(servicePackages)
      .where(eq(servicePackages.companyId, auth.companyId));
    return NextResponse.json(list);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("List packages error:", err);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireManagement(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ erro: "Invalid JSON" }, { status: 400 });
    }

    const parsed = packageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Informe o nome, o serviço, o total de sessões e o preço." },
        { status: 400 }
      );
    }

    const { nome, descricao, servico_id, total_sessoes, preco_total, dias_validade } =
      parsed.data;

    const service = await db.query.services.findFirst({
      where: and(
        eq(services.id, servico_id),
        eq(services.companyId, auth.companyId)
      ),
    });

    if (!service) {
      return NextResponse.json(
        { erro: "Serviço não encontrado." },
        { status: 404 }
      );
    }

    const [pkg] = await db
      .insert(servicePackages)
      .values({
        companyId: auth.companyId,
        serviceId: servico_id,
        name: nome.trim(),
        description: descricao?.trim() || null,
        totalSessions: total_sessoes,
        totalPrice: String(preco_total),
        validityDays: dias_validade,
      })
      .returning();

    return NextResponse.json(
      { mensagem: "Modelo de pacote cadastrado com sucesso!", pacote_id: pkg.id },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Create package error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao cadastrar pacote." },
      { status: 500 }
    );
  }
}
