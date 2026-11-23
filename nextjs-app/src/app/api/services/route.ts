export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { services } from "@/db/schema";
import { requireAuth, ResponseError } from "@/lib/auth";
import { z } from "zod";

const serviceSchema = z.object({
  nome: z.string().min(1).max(100),
  descricao: z.string().max(2000).optional(),
  duracao_minutos: z.number().int().positive(),
  preco: z.number().positive(),
});

const updateServiceSchema = serviceSchema.extend({
  id: z.number().int().positive().max(2147483647),
  nome: z.string().trim().min(1).max(100),
  duracao_minutos: z.number().int().positive().max(2147483647),
  preco: z.number().min(0.01).max(99999999.99).multipleOf(0.01),
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
      .select()
      .from(services)
      .where(eq(services.companyId, auth.companyId))
      .orderBy(services.name);
    return NextResponse.json(list);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("List services error:", err);
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

    const parsed = serviceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Os campos nome, duracao_minutos e preco são obrigatórios." },
        { status: 400 }
      );
    }

    const { nome, descricao, duracao_minutos, preco } = parsed.data;
    const [service] = await db
      .insert(services)
      .values({
        companyId: auth.companyId,
        name: nome.trim(),
        description: descricao?.trim() || null,
        durationMinutes: duracao_minutos,
        price: String(preco),
      })
      .returning();

    return NextResponse.json(
      { mensagem: "Serviço cadastrado com sucesso!", servico_id: service.id },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Create service error:", err);
    return NextResponse.json(
      { erro: "Erro interno ao cadastrar serviço." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireManagement(request);
    const parsed = updateServiceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { erro: "Informe um nome, duração em minutos e preço válidos para o serviço." },
        { status: 400 }
      );
    }

    const { id, nome, descricao, duracao_minutos, preco } = parsed.data;
    const [service] = await db
      .update(services)
      .set({
        name: nome,
        description: descricao?.trim() || null,
        durationMinutes: duracao_minutos,
        price: String(preco),
      })
      .where(and(eq(services.id, id), eq(services.companyId, auth.companyId)))
      .returning();

    if (!service) {
      throw new ResponseError("Serviço não encontrado.", 404);
    }
    return NextResponse.json(service);
  } catch (err) {
    if (err instanceof ResponseError) {
      return NextResponse.json({ erro: err.message }, { status: err.status });
    }
    console.error("Update service error:", err);
    return NextResponse.json({ erro: "Erro interno ao editar serviço." }, { status: 500 });
  }
}
